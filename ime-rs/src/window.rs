//! A frameless Win32 window that hosts the player pages in WebView2.
//! This is the app window, the same role as the Electron `BrowserWindow`.

use std::ptr;

use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{
    CreateCoreWebView2ControllerCompletedHandler, CreateCoreWebView2EnvironmentCompletedHandler,
    WebMessageReceivedEventHandler,
};
use windows::core::{w, PWSTR};
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{CreateSolidBrush, HBRUSH};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{SetProcessDpiAwareness, PROCESS_PER_MONITOR_DPI_AWARE};
use windows::Win32::UI::WindowsAndMessaging;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetClientRect,
    GetMessageW, GetSystemMetrics, GetWindowLongPtrW, PostQuitMessage, RegisterClassW,
    SendMessageW, SetWindowLongPtrW, ShowWindow, TranslateMessage, GWLP_USERDATA, MSG,
    SM_CXSCREEN, SM_CYSCREEN, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SW_SHOW, WNDCLASSW,
    WS_CLIPCHILDREN, WS_EX_APPWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_THICKFRAME,
};

pub fn open(url: &str) {
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
    unsafe {
        match command {
            "minimize" => {
                ShowWindow(hwnd, SW_MINIMIZE);
            }
            "maximize" => {
                if WindowsAndMessaging::IsZoomed(hwnd).as_bool() {
                    ShowWindow(hwnd, SW_RESTORE);
                } else {
                    ShowWindow(hwnd, SW_MAXIMIZE);
                }
            }
            "close" => {
                let _ = DestroyWindow(hwnd);
            }
            "drag" => {
                release_capture();
                SendMessageW(hwnd, 0x00A1, WPARAM(2), LPARAM(0));
            }
            _ => {}
        }
    }
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
        WindowsAndMessaging::WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, w_param, l_param) },
    }
}

