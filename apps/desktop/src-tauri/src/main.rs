#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct BackendState {
    child: Mutex<Option<CommandChild>>,
}

#[cfg(not(debug_assertions))]
fn spawn_backend(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let command = app
        .shell()
        .sidecar("oncowatch-backend")?
        .args(["--host", "127.0.0.1", "--port", "17845"]);
    let (mut rx, child) = command.spawn()?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            println!("[oncowatch-backend] {:?}", event);
        }
    });

    Ok(child)
}

#[cfg(not(debug_assertions))]
fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    tauri::async_runtime::spawn(async move {
        let updater = match app.updater() {
            Ok(updater) => updater,
            Err(error) => {
                eprintln!("[updater] unavailable: {error}");
                return;
            }
        };

        match updater.check().await {
            Ok(Some(update)) => {
                println!("[updater] installing update {}", update.version);
                match update.download_and_install(|_, _| {}, || {}).await {
                    Ok(_) => {
                        println!("[updater] update installed, restarting");
                        app.restart();
                    }
                    Err(error) => eprintln!("[updater] install failed: {error}"),
                }
            }
            Ok(None) => println!("[updater] up to date"),
            Err(error) => eprintln!("[updater] check failed: {error}"),
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BackendState {
            child: Mutex::new(None),
        })
        .setup(|_app| {
            #[cfg(not(debug_assertions))]
            {
                check_for_updates(_app.handle().clone());
                match spawn_backend(&_app.handle()) {
                    Ok(child) => {
                        let state = _app.state::<BackendState>();
                        *state.child.lock().unwrap() = Some(child);
                    }
                    Err(error) => {
                        eprintln!("failed to start backend sidecar: {error}");
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building OncoWatch")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let state = app_handle.state::<BackendState>();
                let mut child_guard = state.child.lock().unwrap();
                if let Some(child) = child_guard.take() {
                    let _ = child.kill();
                }
            }
        });
}
