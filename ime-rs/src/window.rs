//! A frameless Win32 window that hosts the player pages in WebView2.
//! This is the app window, the same role as the Electron `BrowserWindow`.

use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};

use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{
    CreateCoreWebView2ControllerCompletedHandler, CreateCoreWebView2EnvironmentCompletedHandler,
    WebMessageReceivedEventHandler,
};
use windows::core::{w, PCWSTR, PWSTR};
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateBitmap, CreateDIBSection, CreateSolidBrush, DeleteObject, GetDC, ReleaseDC, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBRUSH, RGBQUAD,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{SetProcessDpiAwareness, PROCESS_PER_MONITOR_DPI_AWARE};
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NIM_SETVERSION,
    NOTIFYICONDATAW, NOTIFYICON_VERSION_4,
};
use windows::Win32::UI::WindowsAndMessaging;
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreateIconIndirect, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyIcon,
    DestroyMenu, DestroyWindow, DispatchMessageW, GetClientRect, GetCursorPos, GetMessageW,
    GetSystemMetrics, GetWindowLongPtrW, IsIconic, LoadIconW, PostMessageW, PostQuitMessage,
    RegisterClassW, SendMessageW, SetForegroundWindow, SetWindowLongPtrW, ShowWindow,
    TrackPopupMenu, TranslateMessage, GWLP_USERDATA, HICON, ICONINFO, IDI_APPLICATION, MF_SEPARATOR,
    MF_STRING, MSG, SM_CXSCREEN, SM_CYSCREEN, SW_HIDE, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SW_SHOW,
    TPM_NONOTIFY, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_CLOSE, WM_CONTEXTMENU, WM_LBUTTONDBLCLK,
    WM_LBUTTONUP, WM_NULL, WM_RBUTTONUP, WNDCLASSW, WS_CLIPCHILDREN, WS_EX_APPWINDOW,
    WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_THICKFRAME,
};

use crate::tray::{close_action, CloseAction};

const WM_TRAY: u32 = 0x8001;
const NIN_SELECT: u32 = 0x0400;
const NIN_KEYSELECT: u32 = 0x0401;

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
static QUITTING: AtomicBool = AtomicBool::new(false);
static TRAY_ADDED: AtomicBool = AtomicBool::new(false);
static TRAY_ICON: AtomicIsize = AtomicIsize::new(0);

pub fn open(url: &str, close_to_tray: bool) {
    CLOSE_TO_TRAY.store(close_to_tray, Ordering::SeqCst);
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let _ = SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);
    }

    let hwnd = create_window();
    if hwnd.0 == 0 {
        super::fail("Не удалось создать окно IMe Music.");
    }
    unsafe {
        ShowWindow(hwnd, SW_SHOW);
    }
    pump_pending();

    let controller = match create_controller(hwnd) {
        Ok(controller) => controller,
        Err(err) => super::fail(&format!(
            "Не удалось открыть окно IMe Music.\nНужен компонент WebView2 из Microsoft Edge.\n{err}"
        )),
    };

    let webview = match unsafe { controller.CoreWebView2() } {
        Ok(webview) => webview,
        Err(err) => super::fail(&format!("Не удалось открыть окно IMe Music.\n{err}")),
    };

    unsafe {
        let ptr = Box::into_raw(Box::new(controller));
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, ptr as isize);
    }
    if let Err(err) = fit_and_show(hwnd) {
        super::fail(&format!("Не удалось открыть окно IMe Music.\n{err}"));
    }
    if let Err(err) = show_player(&webview, hwnd, url) {
        super::fail(&format!("Не удалось открыть окно IMe Music.\n{err}"));
    }

    message_loop();
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ICoreWebView2Controller;
        if !ptr.is_null() {
            drop(Box::from_raw(ptr));
        }
    }
}

fn create_window() -> HWND {
    unsafe {
        let class_name = w!("IMeMusicWindow");
        let brush = CreateSolidBrush(COLORREF(0x00151311));
        let instance = HINSTANCE(GetModuleHandleW(None).unwrap_or_default().0);
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            lpszClassName: class_name,
            hbrBackground: brush,
            ..Default::default()
        };
        RegisterClassW(&class);

        let width = 1100;
        let height = 720;
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        let x = (screen_w - width).max(0) / 2;
        let y = (screen_h - height).max(0) / 2;
        let style = WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_CLIPCHILDREN;

        CreateWindowExW(
            WS_EX_APPWINDOW,
            class_name,
            w!("IMe Music"),
            style,
            x,
            y,
            width,
            height,
            None,
            None,
            instance,
            None,
        )
    }
}

fn create_controller(parent: HWND) -> windows::core::Result<ICoreWebView2Controller> {
    let (tx, rx) = std::sync::mpsc::channel();
    CreateCoreWebView2EnvironmentCompletedHandler::wait_for_async_operation(
        Box::new(|handler| unsafe {
            CreateCoreWebView2Environment(&handler).map_err(webview2_com::Error::WindowsError)
        }),
        Box::new(move |error_code, environment| {
            error_code?;
            tx.send(environment.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_POINTER)))
                .expect("webview environment");
            Ok(())
        }),
    )
    .map_err(|err| windows::core::Error::from_win32())?;

    let environment = rx
        .recv()
        .map_err(|_| windows::core::Error::from_win32())??;
    let (tx, rx) = std::sync::mpsc::channel();
    CreateCoreWebView2ControllerCompletedHandler::wait_for_async_operation(
        Box::new(move |handler| unsafe {
            environment
                .CreateCoreWebView2Controller(parent, &handler)
                .map_err(webview2_com::Error::WindowsError)
        }),
        Box::new(move |error_code, controller| {
            error_code?;
            tx.send(controller.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_POINTER)))
                .expect("webview controller");
            Ok(())
        }),
    )
    .map_err(|err| windows::core::Error::from_win32())?;
    rx.recv().map_err(|_| windows::core::Error::from_win32())?
}

fn fit_and_show(hwnd: HWND) -> windows::core::Result<()> {
    unsafe {
        let controller = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ICoreWebView2Controller;
        if controller.is_null() {
            return Ok(());
        }
        let rect = client_rect(hwnd);
        (*controller).SetBounds(rect)?;
        (*controller).SetIsVisible(true)?;
        (*controller).NotifyParentWindowPositionChanged()?;
    }
    Ok(())
}

fn client_rect(hwnd: HWND) -> RECT {
    unsafe {
        let mut rect = RECT::default();
        let _ = GetClientRect(hwnd, &mut rect);
        if rect.right - rect.left < 100 || rect.bottom - rect.top < 100 {
            RECT {
                left: 0,
                top: 0,
                right: 1100,
                bottom: 720,
            }
        } else {
            rect
        }
    }
}

fn pump_pending() {
    unsafe {
        let mut msg = MSG::default();
        while WindowsAndMessaging::PeekMessageW(
            &mut msg,
            HWND::default(),
            0,
            0,
            WindowsAndMessaging::PM_REMOVE,
        )
        .as_bool()
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

fn show_player(webview: &ICoreWebView2, hwnd: HWND, url: &str) -> windows::core::Result<()> {
    let _ = fit_and_show(hwnd);
    let script = "window.ipc={postMessage:function(msg){window.chrome.webview.postMessage(msg);}};";
    let script = windows::core::HSTRING::from(script);
    unsafe {
        let _ = webview.AddScriptToExecuteOnDocumentCreated(&script, None);
        let mut token = windows::Win32::System::WinRT::EventRegistrationToken::default();
        webview.add_WebMessageReceived(
            &WebMessageReceivedEventHandler::create(Box::new(move |_view, args| {
                if let Some(args) = args {
                    let mut raw = PWSTR(ptr::null_mut());
                    if args.WebMessageAsJson(&mut raw).is_ok() {
                        let text = pwstr_to_string(raw);
                        let command = serde_json::from_str::<String>(&text).unwrap_or(text);
                        handle_command(hwnd, &command);
                    }
                }
                Ok(())
            })),
            &mut token,
        )?;
        let url = windows::core::HSTRING::from(url);
        webview.Navigate(&url)?;
    }
    Ok(())
}

fn handle_command(hwnd: HWND, command: &str) {
    match command {
        "minimize" => unsafe {
            ShowWindow(hwnd, SW_MINIMIZE);
        },
        "maximize" => unsafe {
            if WindowsAndMessaging::IsZoomed(hwnd).as_bool() {
                ShowWindow(hwnd, SW_RESTORE);
            } else {
                ShowWindow(hwnd, SW_MAXIMIZE);
            }
        },
        "close" => on_close_request(hwnd),
        "quit" => {
            QUITTING.store(true, Ordering::SeqCst);
            on_close_request(hwnd);
        }
        "tray-on" => CLOSE_TO_TRAY.store(true, Ordering::SeqCst),
        "tray-off" => CLOSE_TO_TRAY.store(false, Ordering::SeqCst),
        "drag" => unsafe {
            release_capture();
            SendMessageW(hwnd, 0x00A1, WPARAM(2), LPARAM(0));
        },
        _ => {}
    }
}

fn on_close_request(hwnd: HWND) {
    match close_action(
        CLOSE_TO_TRAY.load(Ordering::SeqCst),
        QUITTING.load(Ordering::SeqCst),
    ) {
        CloseAction::Hide => hide_to_tray(hwnd),
        CloseAction::Quit => {
            QUITTING.store(true, Ordering::SeqCst);
            remove_tray(hwnd);
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
        }
    }
}

fn hide_to_tray(hwnd: HWND) {
    if !ensure_tray(hwnd) {
        return;
    }
    unsafe {
        ShowWindow(hwnd, SW_HIDE);
    }
}

fn show_main(hwnd: HWND) {
    unsafe {
        if IsIconic(hwnd).as_bool() {
            ShowWindow(hwnd, SW_RESTORE);
        }
        ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
    }
}

fn ensure_tray(hwnd: HWND) -> bool {
    if TRAY_ADDED.load(Ordering::SeqCst) {
        return true;
    }
    unsafe {
        let icon = tray_icon();
        if icon.is_invalid() {
            return false;
        }
        let mut tip = [0u16; 128];
        for (index, unit) in "IMe Music".encode_utf16().take(127).enumerate() {
            tip[index] = unit;
        }
        let mut data: NOTIFYICONDATAW = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
        data.hWnd = hwnd;
        data.uID = 1;
        data.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
        data.uCallbackMessage = WM_TRAY;
        data.hIcon = icon;
        data.szTip = tip;
        if !Shell_NotifyIconW(NIM_ADD, &data).as_bool() {
            let _ = DestroyIcon(icon);
            return false;
        }
        data.Anonymous.uVersion = NOTIFYICON_VERSION_4;
        let _ = Shell_NotifyIconW(NIM_SETVERSION, &data);
        TRAY_ICON.store(icon.0, Ordering::SeqCst);
        TRAY_ADDED.store(true, Ordering::SeqCst);
        true
    }
}

fn remove_tray(hwnd: HWND) {
    if !TRAY_ADDED.swap(false, Ordering::SeqCst) {
        return;
    }
    unsafe {
        let mut data: NOTIFYICONDATAW = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
        data.hWnd = hwnd;
        data.uID = 1;
        let _ = Shell_NotifyIconW(NIM_DELETE, &data);
        let icon = TRAY_ICON.swap(0, Ordering::SeqCst);
        if icon != 0 {
            let _ = DestroyIcon(HICON(icon));
        }
    }
}

fn tray_icon() -> HICON {
    unsafe {
        if let Some(icon) = draw_tray_icon() {
            return icon;
        }
        LoadIconW(None, IDI_APPLICATION).unwrap_or_default()
    }
}

fn draw_tray_icon() -> Option<HICON> {
    unsafe {
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: 16,
                biHeight: -16,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };
        let mut bits: *mut std::ffi::c_void = ptr::null_mut();
        let screen = GetDC(None);
        let color = CreateDIBSection(
            screen,
            &info,
            DIB_RGB_COLORS,
            &mut bits,
            windows::Win32::Foundation::HANDLE(0),
            0,
        )
        .ok()?;
        let _ = ReleaseDC(None, screen);
        if bits.is_null() {
            let _ = DeleteObject(color);
            return None;
        }
        let pixels = std::slice::from_raw_parts_mut(bits as *mut u8, 16 * 16 * 4);
        for y in 0..16 {
            for x in 0..16 {
                let dx = x as i32 - 8;
                let dy = y as i32 - 8;
                let offset = (y * 16 + x) * 4;
                if dx * dx + dy * dy <= 49 {
                    pixels[offset] = 0xfe;
                    pixels[offset + 1] = 0xa8;
                    pixels[offset + 2] = 0x6e;
                    pixels[offset + 3] = 0xff;
                }
            }
        }
        // A small white bar so the circle reads as the player mark.
        for y in 4..12 {
            for x in 6..8 {
                let offset = (y * 16 + x) * 4;
                pixels[offset] = 0xff;
                pixels[offset + 1] = 0xff;
                pixels[offset + 2] = 0xff;
                pixels[offset + 3] = 0xff;
            }
        }
        let mask_bits = [0u8; 32];
        let mask = CreateBitmap(16, 16, 1, 1, Some(mask_bits.as_ptr() as *const _));
        if mask.is_invalid() {
            let _ = DeleteObject(color);
            return None;
        }
        let icon_info = ICONINFO {
            fIcon: windows::Win32::Foundation::BOOL(1),
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: mask,
            hbmColor: color,
        };
        let icon = CreateIconIndirect(&icon_info).ok();
        let _ = DeleteObject(color);
        let _ = DeleteObject(mask);
        icon
    }
}

fn show_tray_menu(hwnd: HWND) {
    unsafe {
        let Ok(menu) = CreatePopupMenu() else {
            return;
        };
        let show = wide("Показать");
        let quit = wide("Выход");
        let _ = AppendMenuW(menu, MF_STRING, 1, PCWSTR(show.as_ptr()));
        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
        let _ = AppendMenuW(menu, MF_STRING, 2, PCWSTR(quit.as_ptr()));
        let mut point = POINT::default();
        let _ = GetCursorPos(&mut point);
        let _ = SetForegroundWindow(hwnd);
        let picked = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY,
            point.x,
            point.y,
            0,
            hwnd,
            None,
        );
        let _ = PostMessageW(hwnd, WM_NULL, WPARAM(0), LPARAM(0));
        let _ = DestroyMenu(menu);
        match picked.0 as usize {
            1 => show_main(hwnd),
            2 => {
                QUITTING.store(true, Ordering::SeqCst);
                on_close_request(hwnd);
            }
            _ => {}
        }
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn release_capture() {
    #[link(name = "user32")]
    extern "system" {
        fn ReleaseCapture() -> i32;
    }
    unsafe {
        ReleaseCapture();
    }
}

fn resize_to_client(hwnd: HWND) {
    let _ = fit_and_show(hwnd);
}

fn message_loop() {
    unsafe {
        let mut msg = MSG::default();
        loop {
            let result = GetMessageW(&mut msg, HWND::default(), 0, 0);
            if result.0 == 0 || result.0 == -1 {
                break;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

fn pwstr_to_string(raw: PWSTR) -> String {
    unsafe {
        if raw.0.is_null() {
            return String::new();
        }
        let mut len = 0;
        while *raw.0.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(raw.0, len);
        String::from_utf16_lossy(slice)
    }
}

extern "system" fn window_proc(hwnd: HWND, msg: u32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    match msg {
        WindowsAndMessaging::WM_SIZE => {
            resize_to_client(hwnd);
            LRESULT(0)
        }
        WM_CLOSE => {
            on_close_request(hwnd);
            LRESULT(0)
        }
        WM_TRAY => {
            let event = (l_param.0 as u32) & 0xffff;
            match event {
                WM_LBUTTONUP | WM_LBUTTONDBLCLK | NIN_SELECT | NIN_KEYSELECT => show_main(hwnd),
                WM_RBUTTONUP | WM_CONTEXTMENU => show_tray_menu(hwnd),
                _ => {}
            }
            LRESULT(0)
        }
        WindowsAndMessaging::WM_DESTROY => {
            remove_tray(hwnd);
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, w_param, l_param) },
    }
}

