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

#[cfg(desktop)]
fn build_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;
    use tauri::{Emitter, Manager};

    let open = MenuItem::with_id(app, "open", "Open Loops", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Capture…", true, Some("Cmd+Shift+L"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &quit])?;

    // A template image: macOS ignores its colour and tints the alpha to match
    // the menu bar, so this one is flat black on transparent.
    let mark = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id("loops")
        .icon(mark)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "capture" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("capture", ());
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
    use tauri::{Emitter, Manager};
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    let capture = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyL);

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut != &capture || event.state() != ShortcutState::Pressed {
                    return;
                }
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
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
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Updates come from GitHub Releases; the frontend checks at
                // startup and offers a restart when one is ready.
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                register_capture_shortcut(app.handle())?;
                build_tray(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
