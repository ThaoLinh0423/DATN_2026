#include "PMS.h"
#include "DHT.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>

// ===========================================
// CẤU HÌNH - TỰ ĐỘNG PATCH BỞI DEPLOY TOOL
// KHÔNG SỬA TRỰC TIẾP - dùng: python main.py config
// ===========================================
const char* WIFI_SSID      = "{{WIFI_SSID}}";
const char* WIFI_PASSWORD   = "{{WIFI_PASSWORD}}";

const char* MQTT_BROKER    = "{{MQTT_BROKER}}";
const int   MQTT_PORT      = {{MQTT_PORT}};
const char* MQTT_CLIENT_ID  = "{{MQTT_CLIENT_ID}}";
const char* MQTT_USERNAME   = "{{MQTT_USERNAME}}";
const char* MQTT_PASSWORD   = "{{MQTT_PASSWORD}}";
const char* LOCATION        = "{{LOCATION}}";

const unsigned long MEASUREMENT_INTERVAL    = {{MEASUREMENT_INTERVAL}};
const unsigned long WIFI_TIMEOUT            = 10000;
const unsigned long MQTT_RECONNECT_INTERVAL = 5000;

// ===========================================
// MQTT Topics
// ===========================================
const char* MQTT_TOPIC_TEMPERATURE = "sensors/{{MQTT_CLIENT_ID}}/temperature";
const char* MQTT_TOPIC_HUMIDITY    = "sensors/{{MQTT_CLIENT_ID}}/humidity";
const char* MQTT_TOPIC_HEAT_INDEX  = "sensors/{{MQTT_CLIENT_ID}}/heatindex";
const char* MQTT_TOPIC_PM1         = "sensors/{{MQTT_CLIENT_ID}}/pm1";
const char* MQTT_TOPIC_PM25        = "sensors/{{MQTT_CLIENT_ID}}/pm25";
const char* MQTT_TOPIC_PM10        = "sensors/{{MQTT_CLIENT_ID}}/pm10";
const char* MQTT_TOPIC_STATUS      = "sensors/{{MQTT_CLIENT_ID}}/status";
String      MQTT_TOPIC_ALL_DATA;

// ===========================================
// HARDWARE
// ===========================================
PMS pms(Serial2);
PMS::DATA data;

#define PMS_RX_PIN 16
#define PMS_TX_PIN 17
#define DHTPIN     18
#define DHTTYPE    DHT22

DHT dht(DHTPIN, DHTTYPE);
WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);

unsigned long lastMeasurement          = 0;
unsigned long lastMqttReconnectAttempt = 0;
bool          otaInProgress            = false;

// ===========================================
// OTA SETUP
// ===========================================
void setupOTA()
{
  ArduinoOTA.setHostname(MQTT_CLIENT_ID);
  // ArduinoOTA.setPassword("ota_password");  // bỏ comment nếu muốn bảo vệ

  ArduinoOTA.onStart([]() {
    otaInProgress = true;
    pms.sleep();  // tắt PMS để tránh xung đột serial
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "firmware" : "filesystem";
    Serial.println("[OTA] Bắt đầu update: " + type);
  });

  ArduinoOTA.onEnd([]() {
    otaInProgress = false;
    Serial.println("\n[OTA] Hoàn tất! Đang khởi động lại...");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] %u%%\r", (progress * 100) / total);
  });

  ArduinoOTA.onError([](ota_error_t error) {
    otaInProgress = false;
    Serial.printf("[OTA] Lỗi [%u]: ", error);
    if      (error == OTA_AUTH_ERROR)    Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR)   Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR)     Serial.println("End Failed");
  });

  ArduinoOTA.begin();
  Serial.printf("[OTA] Sẵn sàng | hostname: %s | IP: %s\n",
                MQTT_CLIENT_ID, WiFi.localIP().toString().c_str());
}

// ===========================================
void setup()
{
  Serial.begin(115200);
  mqttClient.setBufferSize(512);
  Serial2.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  dht.begin();

  MQTT_TOPIC_ALL_DATA = String("sensors/") + MQTT_CLIENT_ID + "/all";

  Serial.println("=== ESP32 Multi-Sensor MQTT Station ===");
  Serial.printf("Device   : %s\n", MQTT_CLIENT_ID);
  Serial.printf("Location : %s\n", LOCATION);
  Serial.printf("Interval : %lu ms\n", MEASUREMENT_INTERVAL);
  Serial.println("========================================");

  delay(1000);
  pms.passiveMode();

  connectToWiFi();
  setupOTA();

  wifiClient.setInsecure();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  Serial.println("Hệ thống sẵn sàng!");
}

// ===========================================
void loop()
{
  ArduinoOTA.handle();         // luôn đứng đầu loop
  if (otaInProgress) return;   // nhường toàn bộ CPU cho OTA

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi mất kết nối, đang thử lại...");
    connectToWiFi();
    setupOTA();  // đăng ký lại OTA sau khi kết nối WiFi mới
  }

  if (!mqttClient.connected()) {
    if (millis() - lastMqttReconnectAttempt > MQTT_RECONNECT_INTERVAL) {
      lastMqttReconnectAttempt = millis();
      connectToMQTT();
    }
  } else {
    mqttClient.loop();
  }

  if (millis() - lastMeasurement > MEASUREMENT_INTERVAL) {
    lastMeasurement = millis();
    performMeasurements();
  }

  delay(100);
}

// ===========================================
void connectToWiFi()
{
  Serial.printf("Kết nối WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < WIFI_TIMEOUT) {
    delay(500); Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi OK | IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("Kết nối WiFi thất bại!");
  }
}

// ===========================================
void connectToMQTT()
{
  Serial.printf("Kết nối MQTT: %s:%d\n", MQTT_BROKER, MQTT_PORT);
  mqttClient.setKeepAlive(60);

  bool ok = (strlen(MQTT_USERNAME) == 0)
    ? mqttClient.connect(MQTT_CLIENT_ID)
    : mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD);

  if (ok) {
    Serial.println("MQTT OK!");
    mqttClient.publish(MQTT_TOPIC_STATUS, "online", true);
  } else {
    Serial.printf("MQTT thất bại, rc=%d\n", mqttClient.state());
  }
}

// ===========================================
void performMeasurements()
{
  Serial.println("\n=== Chu kỳ đo bắt đầu ===");

  float temp, hum, heatIdx;
  bool dhtOk = readTemperatureHumidity(temp, hum, heatIdx);

  if (mqttClient.connected()) mqttClient.loop();
  ArduinoOTA.handle();
  if (otaInProgress) return;
  delay(2000);

  uint16_t pm1, pm25, pm10;
  bool pmsOk = readAirQuality(pm1, pm25, pm10);
  if (otaInProgress) return;

  if (!mqttClient.connected()) connectToMQTT();

  if (mqttClient.connected())
    sendDataToMQTT(dhtOk, temp, hum, heatIdx, pmsOk, pm1, pm25, pm10);
  else
    Serial.println("MQTT không kết nối - bỏ qua gửi dữ liệu");

  Serial.println("=== Chu kỳ đo hoàn tất ===");
}

// ===========================================
bool readTemperatureHumidity(float &temp, float &hum, float &heatIdx)
{
  hum    = dht.readHumidity();
  temp   = dht.readTemperature();
  float tempF = dht.readTemperature(true);

  if (isnan(hum) || isnan(temp)) { Serial.println("Lỗi DHT!"); return false; }

  heatIdx = dht.computeHeatIndex(temp, hum, false);
  Serial.printf("Nhiệt độ: %.1f°C | Độ ẩm: %.1f%% | HeatIdx: %.1f°C\n",
                temp, hum, heatIdx);
  evaluateComfort(temp, hum);
  return true;
}

// ===========================================
bool readAirQuality(uint16_t &pm1, uint16_t &pm25, uint16_t &pm10)
{
  Serial.println("Đánh thức PMS...");
  pms.wakeUp();

  unsigned long t = millis();
  while (millis() - t < 30000) {
    ArduinoOTA.handle();
    if (otaInProgress) return false;
    if (mqttClient.connected()) mqttClient.loop();
    else if (millis() - lastMqttReconnectAttempt > MQTT_RECONNECT_INTERVAL) {
      lastMqttReconnectAttempt = millis();
      connectToMQTT();
    }
    delay(100);
  }

  pms.requestRead();
  for (int i = 0; i < 5; i++) {
    ArduinoOTA.handle();
    if (otaInProgress) { pms.sleep(); return false; }
    if (mqttClient.connected()) mqttClient.loop();

    if (pms.readUntil(data, 2000)) {
      pm1  = data.PM_AE_UG_1_0;
      pm25 = data.PM_AE_UG_2_5;
      pm10 = data.PM_AE_UG_10_0;
      Serial.printf("PM1: %d | PM2.5: %d | PM10: %d μg/m³\n", pm1, pm25, pm10);
      evaluateAirQuality(pm25);
      pms.sleep();
      return true;
    }
    Serial.printf("Thử lần %d thất bại...\n", i + 1);
    delay(1000);
  }

  Serial.println("Không đọc được PMS!");
  pms.sleep();
  return false;
}

// ===========================================
void sendDataToMQTT(bool dhtOk, float temp, float hum, float heatIdx,
                    bool pmsOk, uint16_t pm1, uint16_t pm25, uint16_t pm10)
{
  if (dhtOk) {
    mqttClient.publish(MQTT_TOPIC_TEMPERATURE, String(temp, 2).c_str());
    mqttClient.publish(MQTT_TOPIC_HUMIDITY,    String(hum,  2).c_str());
    mqttClient.publish(MQTT_TOPIC_HEAT_INDEX,  String(heatIdx, 2).c_str());
  }
  if (pmsOk) {
    mqttClient.publish(MQTT_TOPIC_PM1,  String(pm1).c_str());
    mqttClient.publish(MQTT_TOPIC_PM25, String(pm25).c_str());
    mqttClient.publish(MQTT_TOPIC_PM10, String(pm10).c_str());
  }

  StaticJsonDocument<400> doc;
  JsonObject root = doc.to<JsonObject>();
  root["timestamp"] = millis();
  root["device_id"] = MQTT_CLIENT_ID;
  root["location"]  = LOCATION;

  if (dhtOk) {
    JsonObject c = root.createNestedObject("climate");
    c["temperature"] = round(temp * 100) / 100.0;
    c["humidity"]    = round(hum  * 100) / 100.0;
    c["heat_index"]  = round(heatIdx * 100) / 100.0;
    c["comfort"]     = getComfortStatus(temp, hum);
  }
  if (pmsOk) {
    JsonObject a = root.createNestedObject("air_quality");
    a["pm1"]        = pm1;
    a["pm25"]       = pm25;
    a["pm10"]       = pm10;
    a["aqi_status"] = getAQIStatus(pm25);
  }

  String json;
  serializeJson(doc, json);
  mqttClient.publish(MQTT_TOPIC_ALL_DATA.c_str(), json.c_str());
  Serial.println("JSON: " + json);
}

// ===========================================
String getComfortStatus(float t, float h)
{
  bool tOk = (t >= 20.0 && t <= 26.0);
  bool hOk = (h >= 40.0 && h <= 60.0);
  if (tOk && hOk) return "comfortable";
  if (tOk || hOk) return "moderate";
  return "uncomfortable";
}

String getAQIStatus(uint16_t pm25)
{
  if (pm25 <= 12)  return "good";
  if (pm25 <= 35)  return "moderate";
  if (pm25 <= 55)  return "unhealthy_sensitive";
  if (pm25 <= 150) return "unhealthy";
  if (pm25 <= 250) return "very_unhealthy";
  return "hazardous";
}

void evaluateAirQuality(uint16_t pm25)
{
  const char* s =
    pm25 <= 12  ? "Tốt" :
    pm25 <= 35  ? "Trung bình" :
    pm25 <= 55  ? "Không tốt (nhạy cảm)" :
    pm25 <= 150 ? "Không tốt" :
    pm25 <= 250 ? "Rất không tốt" : "Nguy hiểm";
  Serial.printf("AQI: %s\n", s);
}

void evaluateComfort(float t, float h)
{
  bool tOk = (t >= 20.0 && t <= 26.0);
  bool hOk = (h >= 40.0 && h <= 60.0);
  const char* s = (tOk && hOk) ? "Thoải mái"
                : (tOk || hOk) ? "Tương đối thoải mái"
                :                "Không thoải mái";
  Serial.printf("Comfort: %s\n", s);
}
