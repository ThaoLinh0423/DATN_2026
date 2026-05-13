## 📦 Library Installation

Before uploading the code to your ESP32, make sure the following libraries are installed in the Arduino IDE:

1. **WiFi.h**
   → Built-in library for ESP32, used for Wi-Fi connectivity.

2. **PubSubClient**
   → A popular MQTT client library for Arduino.
   🔗 [Website](http://pubsubclient.knolleary.net/) • [GitHub](https://github.com/knolleary/pubsubclient)

3. **DHT Sensor Library (by Adafruit)**
   → Used to interface with DHT11/DHT22 temperature and humidity sensors.
   🔗 [GitHub - Adafruit DHT](https://github.com/adafruit/DHT-sensor-library)

4. **PMS Library (by fu-hsi)**
   → Library for reading data from the PMS7003 dust sensor.
   🔗 [GitHub - fu-hsi/pms](https://github.com/fu-hsi/pms)

---

## 🚀 Uploading Code to ESP32

1. Open the `.ino` file (e.g. `dht22_test.ino`) in Arduino IDE.
2. Go to **Tools > Board** and select: `DOIT ESP32 DEVKIT V1` (or your specific board).
3. Connect your ESP32 via USB.
4. Go to **Tools > Port** and select the appropriate COM port.
5. Click the **Upload** button (right arrow).

---

## ⚠️ Common Issues

* ❗ **Disconnect the DHT22 sensor** (or any other sensor module connected to GPIO) **before uploading code.**
  → Some sensor modules interfere with the flashing process by holding certain pins HIGH or LOW.

* ❗ Double-check baud rate: Use **115200** in the Serial Monitor.

---
