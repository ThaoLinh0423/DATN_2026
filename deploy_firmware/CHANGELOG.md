# Changelog

Tat ca thay doi dang chu y cua project duoc ghi tai day.

## 0.1.0 - 2026-04-22

Phien ban dau tien cua ESP32 Firmware Deploy Tool.

### Added

- Chuong trinh CMD tuong tac voi prompt `esp32>`.
- Giao dien terminal bang Rich: banner, table, panel, mau trang thai va goi y buoc tiep theo.
- Lenh `status` de xem trang thai project khi moi mo tool.
- Lenh `guide` de huong dan workflow cho nguoi moi.
- Lenh `driver` va `doctor` de kiem tra driver USB/COM, `pyserial`, `esptool`, `arduino-cli`.
- Nhan dien cong COM Bluetooth de tranh recommend nham khi flash ESP32.
- Lenh `config` de xem va sua WiFi, MQTT, vi tri sensor va chu ky do.
- Lenh `scan` de liet ke cac cong COM.
- Lenh `flash` de patch config, compile firmware va flash qua USB COM.
- Lenh `ota` de compile va upload firmware qua WiFi.
- Lenh `monitor` de xem log serial tu ESP32.
- Tu patch placeholder trong `firmware/sensor.ino` bang gia tri trong `config.json`.
- Ho tro file build tam trong `.build/`.
- Script `install.bat` cho Windows.

### Notes

- Can cai `arduino-cli` rieng de compile firmware.
- Can driver USB-UART phu hop voi board ESP32: CP210x, CH340/CH341 hoac FTDI.
- Neu chi thay COM Bluetooth, khong nen dung cong do de flash ESP32.
