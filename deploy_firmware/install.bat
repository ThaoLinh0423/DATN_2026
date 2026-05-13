@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
set "ARDUINO_CLI_DIR=%PROJECT_DIR%tools\arduino-cli"
set "ARDUINO_CLI_EXE=%ARDUINO_CLI_DIR%\arduino-cli.exe"
set "ARDUINO_CLI_URL=https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
set "ESP32_CORE_INDEX_URL=https://espressif.github.io/arduino-esp32/package_esp32_index.json"
set "ARDUINO_DIRECTORIES_DATA=%PROJECT_DIR%.arduino15"
set "PATH=%ARDUINO_CLI_DIR%;%PATH%"

echo ============================================
echo   ESP32 Deploy Tool - Cai dat
echo ============================================
echo.

rem Kiem tra Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Python chua duoc cai. Tai tai: https://python.org
    pause
    exit /b 1
)
echo [OK] Python da co

rem Cai Python dependencies can thiet
echo.
echo Dang cai Python packages...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check
if errorlevel 1 (
    echo [FAIL] Cai packages that bai!
    pause
    exit /b 1
)
echo [OK] Packages da cai xong

rem Cai arduino-cli local neu may chua co
where arduino-cli >nul 2>&1
if errorlevel 1 (
    if exist "%ARDUINO_CLI_EXE%" (
        echo [OK] arduino-cli local da co
    ) else (
        echo.
        echo Dang tai va cai arduino-cli vao tools\arduino-cli...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $url=$env:ARDUINO_CLI_URL; $dest=$env:ARDUINO_CLI_DIR; $zip=Join-Path $env:TEMP 'arduino-cli-latest-windows-64bit.zip'; $extract=Join-Path $env:TEMP ('arduino-cli-' + [guid]::NewGuid().ToString()); if(Test-Path $dest){Remove-Item $dest -Recurse -Force}; [void](New-Item -ItemType Directory -Force -Path $dest); Invoke-WebRequest -Uri $url -OutFile $zip; Expand-Archive -Path $zip -DestinationPath $extract -Force; $exe=@(Get-ChildItem -Path $extract -Filter arduino-cli.exe -Recurse)[0]; if(-not $exe){throw 'Khong tim thay arduino-cli.exe trong file tai ve'}; Copy-Item -Path $exe.FullName -Destination (Join-Path $dest 'arduino-cli.exe') -Force; Remove-Item $zip -Force; Remove-Item $extract -Recurse -Force"
        if errorlevel 1 (
            echo [FAIL] Khong tai/cai duoc arduino-cli.
            echo Tai thu cong tai: https://arduino.github.io/arduino-cli/latest/installation/
            pause
            exit /b 1
        )
        echo [OK] arduino-cli da cai local
    )
) else (
    echo [OK] arduino-cli da co trong PATH
)

rem Kiem tra arduino-cli sau khi cai
arduino-cli version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] arduino-cli da tai nhung chua chay duoc.
    echo Thu mo CMD moi hoac chay: "%ARDUINO_CLI_EXE%" version
    pause
    exit /b 1
)

echo.
echo Kiem tra ESP32 core...
arduino-cli core list 2>nul | findstr /C:"esp32:esp32" >nul
if not errorlevel 1 (
    echo [OK] ESP32 core da co
) else (
    echo ESP32 core chua co, dang cai lan dau...
    arduino-cli core update-index --additional-urls "%ESP32_CORE_INDEX_URL%"
    if errorlevel 1 (
        echo [WARN] Update index that bai. Kiem tra internet roi thu lai khi can compile.
    ) else (
        arduino-cli core install esp32:esp32 --additional-urls "%ESP32_CORE_INDEX_URL%"
        if errorlevel 1 (
            echo [WARN] Cai ESP32 core that bai. Hay thu chay lai:
            echo   arduino-cli core install esp32:esp32 --additional-urls "%ESP32_CORE_INDEX_URL%"
        ) else (
            echo [OK] ESP32 core da cai
        )
    )
)

echo.
echo ============================================
echo   Cai dat hoan tat!
echo ============================================
echo.
echo Cach dung:
echo   python main.py
echo   python main.py guide
echo   python main.py driver
echo   python main.py driver --install ch340
echo   python main.py driver --inf "C:\Drivers\CH341SER"
echo   python main.py config
echo   python main.py scan
echo   python main.py flash -p COM3
echo   python main.py ota -H 192.168.x.x
echo   python main.py monitor -p COM3
echo.
pause
