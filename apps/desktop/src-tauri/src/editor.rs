//! The Editor (FEAT-030): a window that opens on demand. Opening it starts the
//! local service (`services/mc-local`), hands the window the port and a token
//! for this run, and closing the window stops the service. Nothing here runs
//! until the user opens the editor.

use std::fs::{self, File};
use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::error::{CommandError, CommandResult, ErrorCode};

pub const WINDOW: &str = "editor";
const SERVICE_NAME: &str = if cfg!(windows) { "mc-local.exe" } else { "mc-local" };
const START_TIMEOUT: Duration = Duration::from_secs(15);
const STOP_GRACE: Duration = Duration::from_secs(2);
/// Windows: start the service without a console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Where the editor window reaches the service.
#[derive(Clone, Debug, Serialize, Type)]
pub struct EditorBackend {
    pub port: u16,
    pub token: String,
}

#[derive(Default)]
pub struct Service {
    running: Mutex<Option<Running>>,
}

struct Running {
    child: Child,
    /// Held open: when the service sees its stdin close, it stops.
    stdin: ChildStdin,
    backend: EditorBackend,
}

/// Start the service, or return the one already running.
pub fn start(app: &AppHandle) -> CommandResult<EditorBackend> {
    let state = app.state::<Service>();
    let mut slot = state.running.lock().expect("editor lock");
    if let Some(running) = slot.as_mut()
        && matches!(running.child.try_wait(), Ok(None))
    {
        return Ok(running.backend.clone());
    }
    *slot = None;
    let running = spawn(app)?;
    let backend = running.backend.clone();
    *slot = Some(running);
    Ok(backend)
}

/// Stop the service. Closing its stdin is the polite way; the process is
/// killed if it doesn't leave within a moment. Runs off the UI thread.
pub fn stop(app: &AppHandle) {
    let taken = app.state::<Service>().running.lock().expect("editor lock").take();
    if let Some(running) = taken {
        std::thread::spawn(move || shut_down(running));
    }
}

fn shut_down(mut running: Running) {
    drop(running.stdin);
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
        if matches!(running.child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = running.child.kill();
    let _ = running.child.wait();
}

fn spawn(app: &AppHandle) -> CommandResult<Running> {
    let bin = service_path()?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::new(ErrorCode::Storage, format!("Can't find MouseComb's data folder: {e}")))?
        .join("editor");
    fs::create_dir_all(&dir).map_err(storage)?;
    let log = File::create(dir.join("service.log")).map_err(storage)?;
    let port = free_port()?;
    let token = random_token()?;

    let mut command = Command::new(&bin);
    command
        .args(["serve", "--http", &format!("127.0.0.1:{port}"), "--dir"])
        .arg(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::from(log.try_clone().map_err(storage)?))
        .stderr(Stdio::from(log));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|e| CommandError::new(ErrorCode::System, format!("Couldn't start the editor's service: {e}")))?;

    let mut stdin = child.stdin.take().expect("stdin is piped");
    if let Err(e) = writeln!(stdin, "{{\"token\":\"{token}\"}}").and_then(|()| stdin.flush()) {
        let _ = child.kill();
        return Err(CommandError::new(ErrorCode::System, format!("Couldn't configure the editor's service: {e}")));
    }
    wait_until_listening(&mut child, port)?;
    Ok(Running { child, stdin, backend: EditorBackend { port, token } })
}

fn wait_until_listening(child: &mut Child, port: u16) -> CommandResult<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return Ok(());
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(CommandError::new(
                ErrorCode::System,
                format!("The editor's service stopped at start ({status})."),
            ));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(CommandError::new(ErrorCode::System, "The editor's service didn't start in time."));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// The service binary: next to MouseComb (where the installer puts it), or the
/// path in MC_LOCAL_BIN for a development build.
fn service_path() -> CommandResult<PathBuf> {
    if let Some(path) = std::env::var_os("MC_LOCAL_BIN") {
        return Ok(PathBuf::from(path));
    }
    let exe = std::env::current_exe().map_err(storage)?;
    let beside = exe.parent().map(|dir| dir.join(SERVICE_NAME));
    match beside {
        Some(path) if path.is_file() => Ok(path),
        _ => Err(CommandError::new(
            ErrorCode::Unsupported,
            "The editor's service isn't installed. In a development build, see CR/APP_SPEC.md (FEAT-030).",
        )),
    }
}

fn free_port() -> CommandResult<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(storage)?;
    Ok(listener.local_addr().map_err(storage)?.port())
}

fn random_token() -> CommandResult<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|e| CommandError::new(ErrorCode::System, format!("Couldn't make a token: {e}")))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn storage(e: std::io::Error) -> CommandError {
    CommandError::new(ErrorCode::Storage, format!("The editor couldn't use a file on this PC: {e}"))
}

/// Show the editor window, building it the first time (it isn't created at startup).
pub fn show(app: &AppHandle) -> CommandResult<()> {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == WINDOW)
        .cloned()
        .ok_or_else(|| CommandError::new(ErrorCode::Unsupported, "The editor window isn't in this build."))?;
    tauri::WebviewWindowBuilder::from_config(app, &config)
        .and_then(|builder| builder.visible(true).build())
        .map_err(|e| CommandError::new(ErrorCode::System, format!("Couldn't open the editor: {e}")))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn editor_backend_start(app: AppHandle) -> CommandResult<EditorBackend> {
    tauri::async_runtime::spawn_blocking(move || start(&app))
        .await
        .map_err(|e| CommandError::new(ErrorCode::System, format!("The editor's start was interrupted: {e}")))?
}

#[tauri::command]
#[specta::specta]
pub async fn editor_backend_stop(app: AppHandle) -> CommandResult<()> {
    stop(&app);
    Ok(())
}

/// Ask for a workspace folder. `None` when the user cancels.
#[tauri::command]
#[specta::specta]
pub async fn editor_pick_folder(app: AppHandle) -> CommandResult<Option<String>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("Choose a folder to edit").blocking_pick_folder()
    })
    .await
    .map_err(|e| CommandError::new(ErrorCode::System, format!("The folder picker was interrupted: {e}")))?;
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned()))
}
