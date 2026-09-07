use tauri_plugin_sql::{Migration, MigrationKind};

/// The one database. `sqlite:` paths resolve inside the app data directory, so
/// this lands next to the app's own config — all local, no network.
pub const DB_URL: &str = "sqlite:loops.db";

/// Migrations are numbered and never edited once shipped; the SQL lives in
/// `migrations/` so the TypeScript test harness can run the exact same files.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "feel stamps become a 1-10 rating",
            sql: include_str!("../migrations/0002_feel_ten.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "contacts — the people at each client",
            sql: include_str!("../migrations/0003_contacts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "how it is with each person",
            sql: include_str!("../migrations/0004_contact_rapport.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "loops become items — todo, idea, waiting",
            sql: include_str!("../migrations/0005_items.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "deadlines and check-ins learn a time of day",
            sql: include_str!("../migrations/0006_time_of_day.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// The menu-bar presence: an icon, and a count when something is actually hot.
/// Zero shows nothing at all — the tray obeys the same rule as the sidebar.
#[tauri::command]
fn set_tray_badge(app: tauri::AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id("loops") {
        let _ = tray.set_title(if count == 0 { None } else { Some(count.to_string()) });
    }
}

/// Bring the window back. On macOS the app runs as a menu-bar accessory while
/// hidden, so showing it also restores the dock icon and ⌘-tab presence.
#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
    use tauri::Manager;

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The window closes; the app stays. The tray and the global shortcut only
/// exist while the process lives, so "close" means hide, and Quit in the tray
/// menu is the real exit.
#[cfg(desktop)]
fn hide_main(app: &tauri::AppHandle) {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

#[cfg(desktop)]
fn build_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;
    use tauri::Emitter;

    let open = MenuItem::with_id(app, "open", "Open Loops", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Capture…", true, Some("Cmd+Shift+L"))?;
    let idea = MenuItem::with_id(app, "capture-idea", "Capture Idea…", true, None::<&str>)?;
    let waiting =
        MenuItem::with_id(app, "capture-waiting", "Capture Waiting-on…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &idea, &waiting, &quit])?;

    // A template image: macOS ignores its colour and tints the alpha to match
    // the menu bar, so this one is flat black on transparent.
    let mark = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id("loops")
        .icon(mark)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "capture" | "capture-idea" | "capture-waiting" => {
                show_main(app);
                let kind = match event.id().as_ref() {
                    "capture-idea" => "idea",
                    "capture-waiting" => "waiting",
                    _ => "todo",
                };
                let _ = app.emit("capture", serde_json::json!({ "kind": kind }));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// ⌘⇧L from anywhere. Capture is only a habit if it costs nothing to reach, so
/// the shortcut is global and brings the window with it.
#[cfg(desktop)]
fn register_capture_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Emitter;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    let capture = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyL);

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut != &capture || event.state() != ShortcutState::Pressed {
                    return;
                }
                show_main(app);
                let _ = app.emit("capture", ());
            })
            .build(),
    )?;

    app.global_shortcut().register(capture)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![set_tray_badge])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use tauri::Manager;
                api.prevent_close();
                hide_main(window.app_handle());
            }
        })
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Updates come from GitHub Releases; the frontend checks at
                // startup and offers a restart when one is ready.
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                register_capture_shortcut(app.handle())?;
                build_tray(app.handle())?;

                // Launch at login so the tray and ⌘⇧L are there before the app
                // is ever opened. The login launch passes --hidden: tray only,
                // no window stealing the morning.
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec!["--hidden"]),
                ))?;
                // Only real installs get registered — a dev build enrolling
                // itself as a login item would outlive the session.
                #[cfg(not(debug_assertions))]
                {
                    use tauri_plugin_autostart::ManagerExt;
                    let autostart = app.autolaunch();
                    if !autostart.is_enabled().unwrap_or(false) {
                        let _ = autostart.enable();
                    }
                }
                if std::env::args().any(|arg| arg == "--hidden") {
                    hide_main(app.handle());
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // ⌘Q asks the app to exit with no code; treat it like closing the
            // window so the tray and ⌘⇧L stay alive. Quit in the tray menu
            // exits with a code and passes through.
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = &event {
                api.prevent_exit();
                hide_main(app);
            }
        });
}
