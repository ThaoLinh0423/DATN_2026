# ESP32 Firmware Deploy Tool

Cong cu nap firmware ESP32 bang CMD/terminal. Tool tu patch `config.json` vao firmware, compile bang `arduino-cli`, flash qua USB COM hoac upload OTA qua WiFi.

Giao dien dung Rich nen khi mo chuong trinh se co bang trang thai, goi y buoc tiep theo va lenh kiem tra driver cho nguoi moi.

## Ban Can Chuan Bi

1. May Windows co Python.
2. ESP32 va cap USB co truyen du lieu.
3. Driver USB-UART cho board ESP32, thuong la CP210x, CH340/CH341 hoac FTDI.
4. `arduino-cli` de compile firmware.

Neu chua biet may dang thieu gi, cu chay tool. Man hinh dau tien se bao trang thai va recommend.

## Cai Dat Lan Dau

Mo CMD hoac PowerShell trong thu muc project:

```bat
cd E:\deploy_firmware
```

Chay script cai dat:

```bat
install.bat
```

Script nay se tu cai Python packages, tu tai `arduino-cli` vao `tools\arduino-cli` neu may chua co, roi cai ESP32 core.

Neu khong dung `install.bat`, co the cai thu cong:

```bat
pip install -r requirements.txt
```

Sau do cai `arduino-cli` tu trang chinh thuc:

```text
https://arduino.github.io/arduino-cli/latest/installation/
```

Cai ESP32 core:

```bat
arduino-cli core install esp32:esp32
```

## Cach Chay De Nguoi Moi De Dung

Chay chuong trinh:

```bat
python main.py
```

Khi vao tool, ban se thay prompt:

```text
esp32>
```

Hay chay theo thu tu nay:

```text
guide
driver
config
flash --port COMx
monitor --port COMx
```

Trong do `COMx` la cong USB serial cua ESP32, vi du `COM7`. Dung lenh `driver` hoac `scan` de xem dung cong nao. Khong dung cac cong co mo ta Bluetooth de flash ESP32.

## Lenh Quan Trong

### Xem trang thai hien tai

```bat
python main.py status
```

Lenh nay kiem tra config, WiFi, MQTT, firmware, `arduino-cli`, `esptool` va COM/driver.

### Huong dan nhanh trong tool

```bat
python main.py guide
```

Dung khi ban moi mo project lan dau va chua biet phai lam gi.

### Kiem tra driver va cong COM

```bat
python main.py driver
```

Lenh nay se:

- liet ke cac cong COM dang co
- doan driver CP210x, CH340/CH341, FTDI hay Bluetooth
- canh bao neu chi thay COM Bluetooth
- goi y cach sua khi khong thay ESP32

### Cai driver tu CMD

Neu biet chip USB-UART tren board, mo trang tai driver chinh thuc bang CMD:

```bat
python main.py driver --install cp210x
python main.py driver --install ch340
python main.py driver --install ftdi
```

Neu da tai va giai nen driver co file `.inf`, mo CMD bang **Run as administrator** roi cai bang:

```bat
python main.py driver --inf C:\Drivers\CH341SER
```

Lenh nay dung `pnputil /add-driver <file.inf> /install`, phu hop khi muon cai driver truc tiep tu CMD.

### Cau hinh WiFi, MQTT va sensor

```bat
python main.py config
```

Lenh nay cho chon tung phan cau hinh va se test phan do truoc khi luu `config.json`.

Sua rieng tung phan:

```bat
python main.py config --section wifi
python main.py config --section mqtt
python main.py config --section sensor
```

Neu sua MQTT, tool se thu ket noi TCP den broker truoc khi luu. Neu broker chi truy cap duoc tu ESP32 hoac mang khac, co the bo qua network test nhung van giu cac test du lieu co ban:

```bat
python main.py config --section mqtt --no-network-test
```

Chi xem cau hinh, khong sua:

```bat
python main.py config --show
```

Tool chi ghi vao `config.json` sau khi test dat. Khong can sua truc tiep file firmware.

### Flash firmware qua USB

Truoc het tim cong COM:

```bat
python main.py driver
```

Sau do flash:

```bat
python main.py flash --port COM7
```

Neu flash khong on dinh, thu baud thap hon:

```bat
python main.py flash --port COM7 --baud 115200
```

### Xem log serial

```bat
python main.py monitor --port COM7
```

Sau khi flash lan dau, dung lenh nay de xem ESP32 ket noi WiFi hay chua va lay IP de dung OTA.

### Upload OTA qua WiFi

Khi ESP32 da online va ban biet IP:

```bat
python main.py ota --host 192.168.1.42
```

Neu firmware co OTA password:

```bat
python main.py ota --host 192.168.1.42 --password mypassword
```

## Workflow De Nho

Lan dau dung board moi:

```text
1. python main.py driver
2. python main.py config --section wifi
3. python main.py config --section mqtt
4. python main.py config --section sensor
5. python main.py flash --port COMx
6. python main.py monitor --port COMx
```

Nhung lan sau, neu ESP32 van cung WiFi:

```text
1. python main.py config --section sensor
2. python main.py ota --host <IP cua ESP32>
```

## Loi Thuong Gap

### Khong thay cong COM cua ESP32

Chay:

```bat
python main.py driver
```

Neu chi thay Bluetooth:

- doi cap USB khac, dam bao cap co truyen du lieu
- cai driver CP210x, CH340/CH341 hoac FTDI dung voi board
- co the mo trang tai driver tu CMD: `python main.py driver --install ch340`
- neu da co file `.inf`, mo CMD Administrator va chay: `python main.py driver --inf C:\Drivers\CH341SER`
- mo Device Manager > Ports (COM & LPT) de xem board co hien khong
- thu giu nut BOOT khi cam board neu board yeu cau

### Flash bao Access denied

- dong Arduino IDE, Serial Monitor hoac app khac dang mo COM
- rut cam lai ESP32
- chay lai `driver` de xem COM co doi khong

### Khong tim thay arduino-cli

Cai `arduino-cli`, sau do mo terminal moi va chay:

```bat
arduino-cli version
arduino-cli core install esp32:esp32
```

### Compile that bai

Kiem tra:

- da cai ESP32 core chua
- file `firmware/sensor.ino` co ton tai khong
- `config.json` co du WiFi/MQTT can thiet khong

## Cau Truc Thu Muc

```text
deploy_firmware/
├── config.json          WiFi, MQTT, Sensor config
├── main.py              CMD tool
├── requirements.txt
├── CHANGELOG.md
├── firmware/
│   └── sensor.ino       Template firmware co {{PLACEHOLDER}}
└── .build/              File build tam, tu sinh ra
    ├── sensor/
    │   └── sensor.ino   Firmware da patch config
    └── bin/
        └── *.bin        Binary sau khi compile
```

## Ghi Chu Firmware

File `firmware/sensor.ino` dung placeholder dang `{{TEN_BIEN}}`.
Tool se tu thay placeholder bang gia tri trong `config.json` truoc khi compile.

Nen sua cau hinh bang:

```bat
python main.py config
```

Khong nen sua truc tiep gia tri WiFi/MQTT trong `firmware/sensor.ino`.
