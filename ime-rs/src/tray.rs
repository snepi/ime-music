//! What the close button does. The Windows window uses this so the tray
//! setting is the same decision the tests cover.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub enum CloseAction {
    Hide,
    Quit,
}

/// Hide when «свернуть в трей» is on. Quit when that setting is off, or when
/// the tray itself asks to exit.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn close_action(close_to_tray: bool, quit_requested: bool) -> CloseAction {
    if quit_requested || !close_to_tray {
        CloseAction::Quit
    } else {
        CloseAction::Hide
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_hides_only_while_the_tray_setting_is_on() {
        assert_eq!(close_action(true, false), CloseAction::Hide);
        assert_eq!(close_action(false, false), CloseAction::Quit);
        assert_eq!(close_action(true, true), CloseAction::Quit);
        assert_eq!(close_action(false, true), CloseAction::Quit);
    }
}
