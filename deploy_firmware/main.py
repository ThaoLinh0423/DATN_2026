#!/usr/bin/env python3
"""
ESP32 Firmware Deploy Tool

Run without arguments to open an interactive command prompt:
  python main.py

Run one command directly from Windows CMD/PowerShell:
  python main.py flash --port COM3
"""

import argparse
import cmd
import ctypes
import json
import os
import shlex
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from typing import Optional

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text


BASE_DIR = Path(__file__).parent
FIRMWARE_DIR = BASE_DIR / "firmware"
FIRMWARE_INO = FIRMWARE_DIR / "sensor.ino"
BUILD_DIR = BASE_DIR / ".build"
CONFIG_FILE = BASE_DIR / "config.json"
ARDUINO_DATA_DIR = BASE_DIR / ".arduino15"

FQBN = "esp32:esp32:esp32"
ESP32_PLATFORM = "esp32:esp32"
ESP32_CORE_INDEX_URL = "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
console = Console()
CONFIG_SECTIONS = ("all", "wifi", "mqtt", "sensor")
DRIVER_DOWNLOADS = {
    "cp210x": {
        "name": "CP210x",
        "vendor": "Silicon Labs",
        "url": "https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers",
    },
    "ch340": {
        "name": "CH340/CH341",
        "vendor": "WCH",
        "url": "https://www.wch.cn/downloads/CH341SER_ZIP.html",
    },
    "ftdi": {
        "name": "FTDI VCP",
        "vendor": "FTDI",
        "url": "https://ftdichip.com/drivers/vcp-drivers/",
    },
}


class CommandError(Exception):
    pass


class HelpRequested(Exception):
    pass


class CmdArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CommandError(f"{self.prog}: {message}\n{self.format_usage().strip()}")

    def exit(self, status: int = 0, message: Optional[str] = None) -> None:
        if status == 0:
            raise HelpRequested()
        if message:
            raise CommandError(message.strip())
        raise CommandError(self.format_usage().strip())


def print_banner() -> None:
    console.print(
        Panel.fit(
            "[bold cyan]ESP32 Firmware Deploy Tool[/]\n"
            "[dim]COM flash | OTA WiFi | Config manager | Serial monitor[/]",
            border_style="cyan",
            padding=(0, 2),
        )
    )


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        raise CommandError(f"config.json khong ton tai tai: {CONFIG_FILE}")
    with CONFIG_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg: dict) -> None:
    with CONFIG_FILE.open("w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")
    console.print(f"[green][OK][/green] Da luu config: [cyan]{CONFIG_FILE}[/cyan]")


def mask(value: str) -> str:
    return "*" * len(value) if value else "[dim]chua cai[/dim]"


def status_text(ok: bool, ok_text: str = "OK", bad_text: str = "Can xu ly") -> Text:
    return Text(ok_text if ok else bad_text, style="green" if ok else "yellow")


def patch_firmware(cfg: dict) -> Path:
    BUILD_DIR.mkdir(exist_ok=True)
    build_ino = BUILD_DIR / "sensor" / "sensor.ino"
    build_ino.parent.mkdir(exist_ok=True)

    src = FIRMWARE_INO.read_text(encoding="utf-8")
    replacements = {
        "WIFI_SSID": cfg["wifi"]["ssid"],
        "WIFI_PASSWORD": cfg["wifi"]["password"],
        "MQTT_BROKER": cfg["mqtt"]["broker"],
        "MQTT_PORT": str(cfg["mqtt"]["port"]),
        "MQTT_CLIENT_ID": cfg["mqtt"]["client_id"],
        "MQTT_USERNAME": cfg["mqtt"]["username"],
        "MQTT_PASSWORD": cfg["mqtt"]["password"],
        "LOCATION": cfg["sensor"]["location"],
        "MEASUREMENT_INTERVAL": str(cfg["sensor"]["measurement_interval"]),
    }

    for key, value in replacements.items():
        src = src.replace(f"{{{{{key}}}}}", value)

    build_ino.write_text(src, encoding="utf-8")
    return build_ino


def find_arduino_cli_path() -> Optional[str]:
    cli = shutil.which("arduino-cli")
    if cli:
        return cli

    candidates = [
        BASE_DIR / "tools/arduino-cli/arduino-cli.exe",
        BASE_DIR / "bin/arduino-cli.exe",
        Path.home() / "AppData/Local/Programs/arduino-cli/arduino-cli.exe",
        Path("C:/Program Files/arduino-cli/arduino-cli.exe"),
        Path("C:/arduino-cli/arduino-cli.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def find_arduino_cli() -> str:
    cli = find_arduino_cli_path()
    if cli:
        return cli
    raise CommandError(
        "Khong tim thay arduino-cli. Chay lenh 'guide' de xem cach cai, "
        "hoac tai tai https://arduino.github.io/arduino-cli/latest/installation/"
    )


def get_serial_ports() -> list:
    try:
        import serial.tools.list_ports as list_ports
    except ImportError as exc:
        raise CommandError("Can cai pyserial: pip install pyserial") from exc
    return list(list_ports.comports())


def get_esptool_status() -> tuple[bool, str]:
    esptool = shutil.which("esptool.py") or shutil.which("esptool")
    if esptool:
        return True, esptool
    try:
        result = subprocess.run(
            [sys.executable, "-m", "esptool", "version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return False, "python -m esptool khong chay duoc"
    if result.returncode == 0:
        first_line = (result.stdout or result.stderr).strip().splitlines()[0]
        return True, first_line
    return False, "python -m esptool khong chay duoc"


def classify_driver(description: str, hwid: str) -> tuple[str, str]:
    haystack = f"{description} {hwid}".lower()
    if "bluetooth" in haystack or "bthenum" in haystack:
        return "Bluetooth", "Khong phai cong USB de flash ESP32"
    if "cp210" in haystack or "silicon labs" in haystack:
        return "CP210x", "Silicon Labs CP210x driver"
    if "ch340" in haystack or "ch341" in haystack or "wch" in haystack:
        return "CH340/CH341", "WCH CH34x driver"
    if "ftdi" in haystack or "ft232" in haystack:
        return "FTDI", "FTDI VCP driver"
    if "usb serial" in haystack or "usb-serial" in haystack:
        return "USB Serial", "Da co driver USB serial"
    return "Khong ro", "Neu flash loi, can cai driver dung chip USB-UART"


def likely_esp32_ports(ports: list) -> list:
    valid = []
    for port in ports:
        driver, _ = classify_driver(port.description, port.hwid)
        if driver != "Bluetooth":
            valid.append(port)
    return valid


def arduino_cli_env() -> dict:
    env = dict(**os.environ)
    env["ARDUINO_DIRECTORIES_DATA"] = str(ARDUINO_DATA_DIR)
    return env


def run_process(
    command: list[str],
    description: str,
    capture: bool = True,
    env: Optional[dict] = None,
) -> subprocess.CompletedProcess:
    console.print(f"\n[bold]{description}[/bold]")
    console.print("[dim]$ " + " ".join(command) + "[/dim]")
    return subprocess.run(command, capture_output=capture, text=True, env=env)


def is_windows_admin() -> bool:
    if sys.platform != "win32":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def quote_cmd_arg(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def open_driver_download(driver_key: str) -> None:
    driver = DRIVER_DOWNLOADS[driver_key]
    url = driver["url"]
    console.print(
        Panel(
            f"[bold]{driver['name']}[/bold] - {driver['vendor']}\n"
            f"[cyan]{url}[/cyan]\n\n"
            "Lenh CMD tuong duong:\n"
            f"[dim]cmd /c start \"\" {quote_cmd_arg(url)}[/dim]",
            title="Tai driver",
            border_style="green",
        )
    )
    if sys.platform == "win32":
        subprocess.run(["cmd", "/c", "start", "", url], check=False)
    else:
        raise CommandError("Lenh cai driver chi ho tro Windows CMD.")


def find_inf_files(path: Path) -> list[Path]:
    if path.is_file():
        if path.suffix.lower() != ".inf":
            raise CommandError(f"File khong phai .inf: {path}")
        return [path]
    if path.is_dir():
        return sorted(path.rglob("*.inf"))
    raise CommandError(f"Khong tim thay duong dan driver: {path}")


def install_driver_inf(path_text: str) -> None:
    if sys.platform != "win32":
        raise CommandError("Cai driver bang pnputil chi ho tro Windows.")

    driver_path = Path(path_text).expanduser()
    inf_files = find_inf_files(driver_path)
    if not inf_files:
        raise CommandError(f"Khong tim thay file .inf trong: {driver_path}")

    if not is_windows_admin():
        cmd_text = f"python main.py driver --inf {quote_cmd_arg(str(driver_path))}"
        raise CommandError(
            "Can mo CMD bang Run as administrator de cai driver.\n"
            f"Sau do chay lai:\n  {cmd_text}"
        )

    for inf_file in inf_files:
        cmd_line = ["pnputil", "/add-driver", str(inf_file), "/install"]
        result = run_process(cmd_line, f"Dang cai driver tu {inf_file.name}...", capture=True)
        if result.stdout:
            console.print(result.stdout)
        if result.stderr:
            console.print(result.stderr)
        if result.returncode != 0:
            raise CommandError(f"Cai driver that bai voi file: {inf_file}")

    console.print("[green][OK][/green] Da cai driver. Rut cam lai ESP32 neu COM chua hien.")


def show_driver_install_commands() -> None:
    table = Table(title="Cai driver tu CMD", box=box.ROUNDED, border_style="cyan")
    table.add_column("Chip")
    table.add_column("Lenh")
    table.add_column("Ghi chu", overflow="fold")
    table.add_row("CP210x", "python main.py driver --install cp210x", "Mo trang tai Silicon Labs")
    table.add_row("CH340/CH341", "python main.py driver --install ch340", "Mo trang tai WCH")
    table.add_row("FTDI", "python main.py driver --install ftdi", "Mo trang tai FTDI VCP")
    table.add_row(".inf da giai nen", r"python main.py driver --inf C:\Drivers\CH341SER", "Chay trong CMD Administrator")
    console.print(table)


def run_arduino_cli(args: list[str], description: str) -> subprocess.CompletedProcess:
    return run_process([find_arduino_cli()] + args, description, capture=True, env=arduino_cli_env())


def run_arduino_cli_live(args: list[str], description: str) -> subprocess.CompletedProcess:
    return run_process([find_arduino_cli()] + args, description, capture=False, env=arduino_cli_env())


def run_arduino_cli_quiet(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([find_arduino_cli()] + args, capture_output=True, text=True, env=arduino_cli_env())


def arduino_cli_with_esp32_index(args: list[str]) -> list[str]:
    return args + ["--additional-urls", ESP32_CORE_INDEX_URL]


def esp32_core_installed() -> bool:
    try:
        result = run_arduino_cli_quiet(["core", "list"])
    except CommandError:
        return False
    return result.returncode == 0 and ESP32_PLATFORM in (result.stdout or "")


def print_process_output(result: subprocess.CompletedProcess) -> None:
    if result.stdout:
        console.print(result.stdout)
    if result.stderr:
        console.print(result.stderr)


def ensure_esp32_core_installed() -> None:
    if esp32_core_installed():
        return

    console.print(
        Panel(
            "Chua co ESP32 core trong Arduino data cua project.\n"
            "Tool se cai vao .arduino15 local truoc khi compile.",
            title="ESP32 core",
            border_style="yellow",
        )
    )

    update_result = run_arduino_cli_live(
        arduino_cli_with_esp32_index(["core", "update-index"]),
        "Dang update Arduino index cho ESP32...",
    )
    if update_result.returncode != 0:
        raise CommandError(
            "Update ESP32 core index that bai. Kiem tra internet roi chay lai.\n"
            f"Lenh thu cong: arduino-cli core update-index --additional-urls {ESP32_CORE_INDEX_URL}"
        )

    install_result = run_arduino_cli_live(
        arduino_cli_with_esp32_index(["core", "install", ESP32_PLATFORM]),
        "Dang cai ESP32 core...",
    )
    if install_result.returncode != 0:
        raise CommandError(
            "Cai ESP32 core that bai.\n"
            f"Lenh thu cong: arduino-cli core install {ESP32_PLATFORM} --additional-urls {ESP32_CORE_INDEX_URL}"
        )

    console.print("[green][OK][/green] ESP32 core da cai xong.")


def find_bin(build_dir: Path) -> Optional[Path]:
    for file in build_dir.rglob("*.ino.bin"):
        return file
    candidates = list(build_dir.rglob("*.bin"))
    return candidates[0] if candidates else None


def find_merged_bin(build_dir: Path) -> Optional[Path]:
    for file in build_dir.rglob("*.merged.bin"):
        return file
    return None


def find_first_file(build_dir: Path, pattern: str) -> Optional[Path]:
    for file in build_dir.rglob(pattern):
        return file
    return None


def build_flash_write_args(build_dir: Path, app_bin: Path) -> list[str]:
    merged_bin = find_merged_bin(build_dir)
    if merged_bin:
        return ["write_flash", "-z", "0x0", str(merged_bin)]

    bootloader_bin = find_first_file(build_dir, "*.bootloader.bin")
    partitions_bin = find_first_file(build_dir, "*.partitions.bin")
    if not bootloader_bin or not partitions_bin:
        raise CommandError(
            "Khong du file bootloader/partition de flash ESP32.\n"
            "Hay chay flash khong co --skip-compile de tao lai bo file day du."
        )

    return [
        "write_flash",
        "-z",
        "0x1000",
        str(bootloader_bin),
        "0x8000",
        str(partitions_bin),
        "0x10000",
        str(app_bin),
    ]


def compile_firmware(build_ino: Path) -> Path:
    ensure_esp32_core_installed()

    result = run_arduino_cli(
        [
            "compile",
            "--fqbn",
            FQBN,
            "--output-dir",
            str(BUILD_DIR / "bin"),
            str(build_ino.parent),
        ],
        "Dang compile firmware...",
    )

    if result.returncode != 0:
        print_process_output(result)
        raise CommandError("Compile that bai.")

    bin_path = find_bin(BUILD_DIR / "bin")
    if not bin_path:
        raise CommandError("Khong tim thay file .bin sau khi compile.")

    console.print(f"[green][OK][/green] Compile thanh cong: [cyan]{bin_path}[/cyan]")
    return bin_path


def show_config(cfg: dict) -> None:
    table = Table(title="Cau hinh hien tai", box=box.ROUNDED, border_style="cyan")
    table.add_column("Muc", style="bold")
    table.add_column("Gia tri")
    table.add_column("Trang thai")

    rows = [
        ("WiFi SSID", cfg["wifi"]["ssid"] or "[dim]chua cai[/dim]", bool(cfg["wifi"]["ssid"])),
        ("WiFi Password", mask(cfg["wifi"]["password"]), bool(cfg["wifi"]["password"])),
        ("MQTT Broker", cfg["mqtt"]["broker"] or "[dim]chua cai[/dim]", bool(cfg["mqtt"]["broker"])),
        ("MQTT Port", str(cfg["mqtt"]["port"]), True),
        ("MQTT Client ID", cfg["mqtt"]["client_id"], bool(cfg["mqtt"]["client_id"])),
        ("MQTT Username", cfg["mqtt"]["username"] or "[dim]chua cai[/dim]", bool(cfg["mqtt"]["username"])),
        ("MQTT Password", mask(cfg["mqtt"]["password"]), bool(cfg["mqtt"]["password"])),
        ("Location", cfg["sensor"]["location"], bool(cfg["sensor"]["location"])),
        ("Measurement Interval", f"{cfg['sensor']['measurement_interval']} ms", True),
    ]
    for name, value, ok in rows:
        table.add_row(name, str(value), status_text(ok, "OK", "Thieu"))
    console.print(table)


def select_config_section(section: Optional[str]) -> str:
    if section:
        return section
    return Prompt.ask(
        "Chon phan cau hinh",
        choices=list(CONFIG_SECTIONS),
        default="all",
    )


def add_check_row(table: Table, name: str, ok: bool, note: str) -> bool:
    table.add_row(name, status_text(ok), note)
    return ok


def test_tcp_connection(host: str, port: int, timeout: float = 5.0) -> tuple[bool, str]:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"Ket noi TCP duoc den {host}:{port}"
    except OSError as exc:
        return False, f"Khong ket noi duoc {host}:{port}: {exc}"


def test_config_section(cfg: dict, section: str, network_test: bool = True) -> None:
    table = Table(title=f"Test cau hinh: {section}", box=box.ROUNDED, border_style="cyan")
    table.add_column("Kiem tra", style="bold")
    table.add_column("Trang thai")
    table.add_column("Ghi chu", overflow="fold")
    checks = []

    if section in ("all", "wifi"):
        checks.append(add_check_row(table, "WiFi SSID", bool(cfg["wifi"]["ssid"]), cfg["wifi"]["ssid"] or "chua cai"))
        checks.append(
            add_check_row(
                table,
                "WiFi password",
                bool(cfg["wifi"]["password"]),
                "da nhap" if cfg["wifi"]["password"] else "chua nhap",
            )
        )

    if section in ("all", "mqtt"):
        broker = cfg["mqtt"]["broker"]
        port = cfg["mqtt"]["port"]
        checks.append(add_check_row(table, "MQTT broker", bool(broker), broker or "chua cai"))
        checks.append(add_check_row(table, "MQTT port", isinstance(port, int) and 1 <= port <= 65535, str(port)))
        checks.append(
            add_check_row(
                table,
                "MQTT client ID",
                bool(cfg["mqtt"]["client_id"]),
                cfg["mqtt"]["client_id"] or "chua cai",
            )
        )
        if broker and isinstance(port, int) and 1 <= port <= 65535:
            if network_test:
                ok, note = test_tcp_connection(broker, port)
                checks.append(add_check_row(table, "MQTT TCP", ok, note))
            else:
                checks.append(add_check_row(table, "MQTT TCP", True, "bo qua theo --no-network-test"))

    if section in ("all", "sensor"):
        interval = cfg["sensor"]["measurement_interval"]
        checks.append(add_check_row(table, "Sensor location", bool(cfg["sensor"]["location"]), cfg["sensor"]["location"] or "chua cai"))
        checks.append(
            add_check_row(
                table,
                "Measurement interval",
                isinstance(interval, int) and interval >= 1000,
                f"{interval} ms" if isinstance(interval, int) else str(interval),
            )
        )

    console.print(table)
    if not all(checks):
        raise CommandError("Test cau hinh chua dat. Config chua duoc luu.")
    console.print("[green][OK][/green] Test cau hinh dat. Tiep tuc luu config.")


def ask_keep(label: str, current: object, password: bool = False, cast=str):
    display = "********" if password and current else str(current)
    value = Prompt.ask(label, default=display, password=password)
    if password and value == display:
        return current
    try:
        return cast(value)
    except ValueError as exc:
        raise CommandError(f"Gia tri khong hop le cho {label}: {value}") from exc


def edit_config_section(cfg: dict, section: str) -> None:
    if section in ("all", "wifi"):
        cfg["wifi"]["ssid"] = ask_keep("WiFi SSID", cfg["wifi"]["ssid"])
        cfg["wifi"]["password"] = ask_keep("WiFi Password", cfg["wifi"]["password"], password=True)

    if section in ("all", "mqtt"):
        cfg["mqtt"]["broker"] = ask_keep("MQTT Broker", cfg["mqtt"]["broker"])
        cfg["mqtt"]["port"] = ask_keep("MQTT Port", cfg["mqtt"]["port"], cast=int)
        cfg["mqtt"]["client_id"] = ask_keep("MQTT Client ID", cfg["mqtt"]["client_id"])
        cfg["mqtt"]["username"] = ask_keep("MQTT Username", cfg["mqtt"]["username"])
        cfg["mqtt"]["password"] = ask_keep("MQTT Password", cfg["mqtt"]["password"], password=True)

    if section in ("all", "sensor"):
        cfg["sensor"]["location"] = ask_keep("Location", cfg["sensor"]["location"])
        cfg["sensor"]["measurement_interval"] = ask_keep(
            "Measurement interval (ms)",
            cfg["sensor"]["measurement_interval"],
            cast=int,
        )


def build_recommendations(cfg: Optional[dict], ports: list, arduino_cli: Optional[str]) -> list[str]:
    recs = []
    usb_ports = likely_esp32_ports(ports)
    if cfg is None:
        return ["Tao file config.json hoac khoi phuc file mau truoc khi flash."]
    if not cfg["wifi"]["ssid"] or not cfg["wifi"]["password"]:
        recs.append("Chay 'config' de nhap WiFi truoc.")
    if not cfg["mqtt"]["broker"]:
        recs.append("Nhap MQTT broker trong 'config' neu firmware can gui du lieu.")
    if not arduino_cli:
        recs.append("Cai arduino-cli va ESP32 core: arduino-cli core install esp32:esp32")
    if not usb_ports:
        recs.append("Cam ESP32 vao USB, bam 'driver' de kiem tra driver/COM.")
    elif cfg and cfg["wifi"]["ssid"] and arduino_cli:
        recs.append(f"Co the flash lan dau bang: flash --port {usb_ports[0].device}")
    recs.append("Sau khi flash, xem log bang: monitor --port <COM>")
    return recs


def show_startup_status() -> None:
    cfg = None
    config_ok = False
    try:
        cfg = load_config()
        config_ok = True
    except CommandError:
        pass

    try:
        ports = get_serial_ports()
        usb_ports = likely_esp32_ports(ports)
        if usb_ports:
            ports_note = f"{len(usb_ports)} cong USB serial, {len(ports)} COM tong"
        elif ports:
            ports_note = f"{len(ports)} COM nhung chi thay Bluetooth/khong ro"
        else:
            ports_note = "khong thay COM"
    except CommandError as exc:
        ports = []
        usb_ports = []
        ports_note = str(exc)

    arduino_cli = find_arduino_cli_path()
    esptool_ok, esptool_note = get_esptool_status()

    table = Table(title="Trang thai hien tai", box=box.ROUNDED, border_style="cyan")
    table.add_column("Hang muc", style="bold")
    table.add_column("Trang thai")
    table.add_column("Ghi chu", overflow="fold")
    table.add_row("config.json", status_text(config_ok), str(CONFIG_FILE) if config_ok else "khong tim thay")
    table.add_row("WiFi", status_text(bool(cfg and cfg["wifi"]["ssid"]), "Da cai", "Chua cai"), cfg["wifi"]["ssid"] if cfg else "")
    table.add_row("MQTT broker", status_text(bool(cfg and cfg["mqtt"]["broker"]), "Da cai", "Chua cai"), cfg["mqtt"]["broker"] if cfg else "")
    table.add_row("Firmware", status_text(FIRMWARE_INO.exists()), str(FIRMWARE_INO))
    table.add_row("arduino-cli", status_text(bool(arduino_cli), "Da co", "Thieu"), arduino_cli or "can cai de compile")
    table.add_row("esptool", status_text(esptool_ok, "Da co", "Thieu"), esptool_note)
    table.add_row("COM/Driver", status_text(bool(usb_ports), "Da thay USB", "Chua thay USB"), ports_note)
    console.print(table)

    recs = build_recommendations(cfg, ports, arduino_cli)
    console.print(
        Panel(
            "\n".join(f"[cyan]{idx}.[/cyan] {item}" for idx, item in enumerate(recs, 1)),
            title="De xuat buoc tiep theo",
            border_style="green" if usb_ports and arduino_cli else "yellow",
        )
    )


def command_config(args: argparse.Namespace) -> None:
    cfg = load_config()
    show_config(cfg)
    if args.show:
        return

    section = select_config_section(args.section)
    console.print("\n[dim]Nhan Enter de giu nguyen gia tri hien tai.[/dim]\n")
    edit_config_section(cfg, section)
    test_config_section(cfg, section, network_test=not args.no_network_test)
    save_config(cfg)


def command_flash(args: argparse.Namespace) -> None:
    cfg = load_config()
    console.print(
        Panel(
            f"[bold]Port:[/bold] [cyan]{args.port}[/cyan]    [bold]Baud:[/bold] [cyan]{args.baud}[/cyan]\n"
            f"[bold]WiFi:[/bold] {cfg['wifi']['ssid'] or '[yellow]chua cai[/yellow]'}    "
            f"[bold]Location:[/bold] {cfg['sensor']['location']}",
            title="Flash qua COM",
            border_style="yellow",
        )
    )

    build_ino = patch_firmware(cfg)
    console.print(f"[green][OK][/green] Da patch firmware: [cyan]{build_ino}[/cyan]")

    if args.skip_compile:
        bin_path = find_bin(BUILD_DIR / "bin")
        if not bin_path:
            raise CommandError("Khong co file .bin san. Hay chay flash khong co --skip-compile.")
    else:
        bin_path = compile_firmware(build_ino)

    esptool = shutil.which("esptool.py") or shutil.which("esptool")
    esptool_cmd = [esptool] if esptool else [sys.executable, "-m", "esptool"]
    flash_args = build_flash_write_args(BUILD_DIR / "bin", bin_path)
    flash_cmd = esptool_cmd + [
        "--chip",
        "esp32",
        "--port",
        args.port,
        "--baud",
        str(args.baud),
    ] + flash_args

    result = run_process(flash_cmd, f"Dang flash len ESP32 tai {args.port}...", capture=False)
    if result.returncode != 0:
        raise CommandError("Flash that bai. Neu khong mo duoc COM, chay 'driver' de kiem tra driver.")
    console.print("[green][OK][/green] Flash thanh cong.")


def command_ota(args: argparse.Namespace) -> None:
    cfg = load_config()
    console.print(
        Panel(
            f"[bold]Target:[/bold] [cyan]{args.host}:{args.ota_port}[/cyan]\n"
            f"[bold]WiFi:[/bold] {cfg['wifi']['ssid'] or '[yellow]chua cai[/yellow]'}    "
            f"[bold]Location:[/bold] {cfg['sensor']['location']}",
            title="OTA qua WiFi",
            border_style="magenta",
        )
    )

    build_ino = patch_firmware(cfg)
    console.print(f"[green][OK][/green] Da patch firmware: [cyan]{build_ino}[/cyan]")
    bin_path = compile_firmware(build_ino)

    espota = shutil.which("espota.py") or shutil.which("espota")
    if espota:
        ota_cmd = [sys.executable, espota] if espota.lower().endswith(".py") else [espota]
        ota_cmd += ["-i", args.host, "-p", str(args.ota_port), "-f", str(bin_path)]
        if args.password:
            ota_cmd += ["-a", args.password]
    else:
        ota_cmd = [
            find_arduino_cli(),
            "upload",
            "--fqbn",
            FQBN,
            "--port",
            args.host,
            "--protocol",
            "network",
            "--input-dir",
            str(BUILD_DIR / "bin"),
            str(build_ino.parent),
        ]

    ota_tool = Path(ota_cmd[0]).name.lower() if ota_cmd else ""
    ota_env = arduino_cli_env() if ota_tool in {"arduino-cli", "arduino-cli.exe"} else None
    result = run_process(ota_cmd, f"Dang upload OTA den {args.host}...", capture=False, env=ota_env)
    if result.returncode != 0:
        raise CommandError("OTA upload that bai.")
    console.print("[green][OK][/green] OTA thanh cong.")


def command_monitor(args: argparse.Namespace) -> None:
    try:
        import serial
    except ImportError as exc:
        raise CommandError("Can cai pyserial: pip install pyserial") from exc

    console.print(
        Panel(
            f"Dang nghe [cyan]{args.port}[/cyan] @ [cyan]{args.baud}[/cyan] baud\n"
            "[dim]Nhan Ctrl+C de thoat[/dim]",
            title="Serial Monitor",
            border_style="blue",
        )
    )
    try:
        with serial.Serial(args.port, args.baud, timeout=1) as ser:
            while True:
                line = ser.readline().decode("utf-8", errors="replace").rstrip()
                if line:
                    lowered = line.lower()
                    if "error" in lowered or "fail" in lowered:
                        console.print(line, style="red")
                    elif "connected" in lowered or "success" in lowered:
                        console.print(line, style="green")
                    else:
                        console.print(line)
    except KeyboardInterrupt:
        console.print("\n[dim]Monitor da dung.[/dim]")
    except serial.SerialException as exc:
        raise CommandError(f"Loi serial: {exc}") from exc


def command_scan(args: argparse.Namespace) -> None:
    ports = get_serial_ports()
    if not ports:
        console.print("[yellow]Khong tim thay cong COM nao. Chay 'driver' de xem goi y cai driver.[/yellow]")
        return

    table = Table(title="Cong COM kha dung", box=box.ROUNDED, border_style="cyan")
    table.add_column("Port", style="bold cyan")
    table.add_column("Mo ta")
    table.add_column("Driver doan")
    table.add_column("HWID", style="dim", overflow="fold")
    for port in ports:
        driver, _ = classify_driver(port.description, port.hwid)
        table.add_row(port.device, port.description, driver, port.hwid)
    console.print(table)


def command_driver(args: argparse.Namespace) -> None:
    if args.install:
        open_driver_download(args.install)
        return
    if args.inf:
        install_driver_inf(args.inf)
        return

    ports = get_serial_ports()
    usb_ports = likely_esp32_ports(ports)
    arduino_cli = find_arduino_cli_path()
    esptool_ok, esptool_note = get_esptool_status()
    esp32_core_ok = esp32_core_installed() if arduino_cli else False

    checks = Table(title="Kiem tra driver va tool", box=box.ROUNDED, border_style="cyan")
    checks.add_column("Hang muc", style="bold")
    checks.add_column("Trang thai")
    checks.add_column("Ghi chu", overflow="fold")
    checks.add_row("pyserial", Text("OK", style="green"), "Da doc duoc danh sach COM")
    checks.add_row("arduino-cli", status_text(bool(arduino_cli), "Da co", "Thieu"), arduino_cli or "can cai de compile")
    checks.add_row(
        "ESP32 core",
        status_text(esp32_core_ok, "Da co", "Thieu"),
        f"{ESP32_PLATFORM} trong {ARDUINO_DATA_DIR}" if esp32_core_ok else "flash/ota se tu cai khi compile",
    )
    checks.add_row("esptool", status_text(esptool_ok, "Da co", "Thieu"), esptool_note)
    checks.add_row(
        "COM USB",
        status_text(bool(usb_ports), "Da thay", "Chua thay"),
        f"{len(usb_ports)} USB serial / {len(ports)} COM tong",
    )
    console.print(checks)

    if ports:
        command_scan(args)
    if not usb_ports:
        console.print(
            Panel(
                "Chua thay cong USB serial phu hop de flash ESP32.\n\n"
                "Thu theo thu tu:\n"
                "1. Doi cap USB co truyen du lieu, khong chi sac.\n"
                "2. Bam nut BOOT khi cam ESP32 neu board yeu cau.\n"
                "3. Cai driver theo chip USB-UART tren board: CP210x, CH340/CH341 hoac FTDI.\n"
                "   Tu CMD co the chay: python main.py driver --install ch340\n"
                "4. Mo Device Manager > Ports (COM & LPT), sau do chay lai 'driver'.",
                title="Goi y driver",
                border_style="yellow",
            )
        )

    flash_tip = (
        f"Neu muon flash ngay: chay flash --port {usb_ports[0].device}."
        if usb_ports
        else "Sau khi thay cong USB serial, chay flash --port <COM>."
    )
    recommendations = [
        flash_tip,
        "Neu flash bao Access denied: dong Arduino IDE/Serial Monitor khac roi thu lai.",
        "Neu flash ket noi cham: thu --baud 115200.",
    ]
    console.print(
        Panel(
            "\n".join(f"[cyan]{idx}.[/cyan] {item}" for idx, item in enumerate(recommendations, 1)),
            title="Recommend",
            border_style="green",
        )
    )
    show_driver_install_commands()


def command_guide(args: argparse.Namespace) -> None:
    console.print(
        Panel(
            "[bold]Lan dau su dung[/bold]\n"
            "1. Chay [cyan]driver[/cyan] de kiem tra ESP32 co hien COM khong.\n"
            "2. Chay [cyan]config --section wifi[/cyan], [cyan]config --section mqtt[/cyan] "
            "hoac [cyan]config --section sensor[/cyan] de cau hinh tung phan.\n"
            "3. Chay [cyan]flash --port COM3[/cyan] de nap firmware lan dau.\n"
            "4. Chay [cyan]monitor --port COM3[/cyan] de xem log va lay IP.\n"
            "5. Nhung lan sau co the chay [cyan]ota --host <IP>[/cyan].\n\n"
            "[bold]Lenh huu ich[/bold]\n"
            "[cyan]status[/cyan] xem trang thai hien tai\n"
            "[cyan]scan[/cyan] liet ke cong COM\n"
            "[cyan]doctor[/cyan] kiem tra tool, driver va goi y sua loi",
            title="Huong dan nhanh",
            border_style="green",
        )
    )


def command_status(args: argparse.Namespace) -> None:
    show_startup_status()


def build_parser() -> CmdArgumentParser:
    parser = CmdArgumentParser(prog="main.py", description="ESP32 Firmware Deploy Tool")
    sub = parser.add_subparsers(dest="command")

    p_config = sub.add_parser("config", help="Xem hoac sua cau hinh")
    p_config.add_argument("--show", "-s", action="store_true", help="Chi hien thi config")
    p_config.add_argument(
        "--section",
        "-S",
        choices=CONFIG_SECTIONS,
        help="Chi sua mot phan cau hinh: wifi, mqtt, sensor hoac all",
    )
    p_config.add_argument(
        "--no-network-test",
        action="store_true",
        help="Bo qua test ket noi TCP toi MQTT broker truoc khi luu",
    )
    p_config.set_defaults(func=command_config)

    p_flash = sub.add_parser("flash", help="Compile va flash firmware qua COM")
    p_flash.add_argument("--port", "-p", required=True, help="Cong COM, vd: COM3")
    p_flash.add_argument("--baud", "-b", type=int, default=921600, help="Toc do baud")
    p_flash.add_argument("--skip-compile", action="store_true", help="Bo qua compile")
    p_flash.set_defaults(func=command_flash)

    p_ota = sub.add_parser("ota", help="Compile va upload firmware qua WiFi")
    p_ota.add_argument("--host", "-H", required=True, help="IP/hostname ESP32")
    p_ota.add_argument("--ota-port", type=int, default=3232, help="OTA port")
    p_ota.add_argument("--password", default="", help="OTA password neu co")
    p_ota.set_defaults(func=command_ota)

    p_monitor = sub.add_parser("monitor", help="Xem serial log qua COM")
    p_monitor.add_argument("--port", "-p", required=True, help="Cong COM, vd: COM3")
    p_monitor.add_argument("--baud", "-b", type=int, default=115200, help="Baud rate")
    p_monitor.set_defaults(func=command_monitor)

    p_scan = sub.add_parser("scan", help="Quet cac cong COM")
    p_scan.set_defaults(func=command_scan)

    p_driver = sub.add_parser("driver", help="Kiem tra driver USB/COM cho ESP32")
    p_driver.add_argument(
        "--install",
        choices=sorted(DRIVER_DOWNLOADS),
        help="Mo trang tai driver chinh thuc tu CMD: cp210x, ch340 hoac ftdi",
    )
    p_driver.add_argument(
        "--inf",
        help="Cai driver tu file/thu muc .inf bang pnputil. Can CMD Run as administrator.",
    )
    p_driver.set_defaults(func=command_driver)

    p_doctor = sub.add_parser("doctor", help="Kiem tra tool, driver va recommend")
    p_doctor.add_argument(
        "--install",
        choices=sorted(DRIVER_DOWNLOADS),
        help="Mo trang tai driver chinh thuc tu CMD: cp210x, ch340 hoac ftdi",
    )
    p_doctor.add_argument(
        "--inf",
        help="Cai driver tu file/thu muc .inf bang pnputil. Can CMD Run as administrator.",
    )
    p_doctor.set_defaults(func=command_driver)

    p_status = sub.add_parser("status", help="Xem trang thai hien tai")
    p_status.set_defaults(func=command_status)

    p_guide = sub.add_parser("guide", help="Huong dan cho nguoi moi")
    p_guide.set_defaults(func=command_guide)

    return parser


def dispatch(argv: list[str]) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
        if not hasattr(args, "func"):
            console.print(parser.format_help())
            return 0
        args.func(args)
        return 0
    except HelpRequested:
        return 0
    except CommandError as exc:
        console.print(f"[red][FAIL][/red] {exc}")
        return 1


class DeployShell(cmd.Cmd):
    intro = "Go 'help' de xem lenh, 'guide' neu moi dung, 'exit' de thoat."
    prompt = "esp32> "

    def emptyline(self) -> None:
        pass

    def default(self, line: str) -> None:
        try:
            argv = shlex.split(line)
        except ValueError as exc:
            console.print(f"[red][FAIL][/red] Khong doc duoc lenh: {exc}")
            return
        if argv:
            dispatch(argv)

    def do_config(self, line: str) -> None:
        self.default("config " + line)

    def do_flash(self, line: str) -> None:
        self.default("flash " + line)

    def do_ota(self, line: str) -> None:
        self.default("ota " + line)

    def do_monitor(self, line: str) -> None:
        self.default("monitor " + line)

    def do_scan(self, line: str) -> None:
        self.default("scan " + line)

    def do_driver(self, line: str) -> None:
        self.default("driver " + line)

    def do_doctor(self, line: str) -> None:
        self.default("doctor " + line)

    def do_status(self, line: str) -> None:
        self.default("status " + line)

    def do_guide(self, line: str) -> None:
        self.default("guide " + line)

    def do_start(self, line: str) -> None:
        self.default("guide " + line)

    def do_help(self, line: str) -> None:
        table = Table(title="Lenh co san", box=box.ROUNDED, border_style="cyan")
        table.add_column("Lenh", style="bold cyan")
        table.add_column("Dung de lam gi")
        table.add_column("Vi du")
        rows = [
            ("status", "Xem trang thai hien tai va recommend", "status"),
            ("guide", "Huong dan cho nguoi moi", "guide"),
            ("config", "Chon phan can sua roi test truoc khi luu", "config"),
            ("config --section wifi", "Chi sua va test WiFi", "config --section wifi"),
            ("config --section mqtt", "Chi sua va test MQTT", "config --section mqtt"),
            ("config --section sensor", "Chi sua va test sensor", "config --section sensor"),
            ("driver", "Kiem tra driver USB/COM", "driver"),
            ("driver --install ch340", "Mo trang tai driver tu CMD", "driver --install ch340"),
            ("driver --inf <path>", "Cai driver .inf bang pnputil", r"driver --inf C:\Drivers\CH341SER"),
            ("scan", "Liet ke cong COM", "scan"),
            ("flash", "Flash firmware qua USB", "flash --port COM3"),
            ("ota", "Upload firmware qua WiFi", "ota --host 192.168.1.42"),
            ("monitor", "Xem serial log", "monitor --port COM3"),
            ("exit", "Thoat chuong trinh", "exit"),
        ]
        for row in rows:
            table.add_row(*row)
        console.print(table)
        console.print("[dim]Tip: nguoi moi nen chay theo thu tu guide -> driver -> config -> flash.[/dim]")

    def do_exit(self, line: str) -> bool:
        return True

    def do_quit(self, line: str) -> bool:
        return True

    def do_EOF(self, line: str) -> bool:
        console.print()
        return True


def main() -> int:
    if len(sys.argv) > 1:
        return dispatch(sys.argv[1:])

    print_banner()
    show_startup_status()
    DeployShell().cmdloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
