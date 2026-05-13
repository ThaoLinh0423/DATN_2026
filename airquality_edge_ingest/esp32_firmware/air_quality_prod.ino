#include "PMS.h"
#include "DHT.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===========================================
// WIFI AND MQTT CONFIGURATION - EDITABLE
// ===========================================
const char* WIFI_SSID = "WIFI_NAME";           // Change this to your WiFi SSID
const char* WIFI_PASSWORD = "WIFI_PASSWORD";    // Change this to your WiFi password

const char* MQTT_BROKER = "MQTT_BROKER_ADDRESS";  // Change this to your MQTT broker address or IP
const int MQTT_PORT = 1883;                 // MQTT port (usually 1883)
const char* MQTT_CLIENT_ID = "ESP32_Sensor_001"; // Device ID (should be unique)
const char* MQTT_USERNAME = "";                 // MQTT username (leave empty if not needed)
const char* MQTT_PASSWORD = "";                 // MQTT password (leave empty if not needed)

// MQTT Topics
const char* MQTT_TOPIC_TEMPERATURE = "sensors/esp32/temperature";
const char* MQTT_TOPIC_HUMIDITY = "sensors/esp32/humidity";
const char* MQTT_TOPIC_HEAT_INDEX = "sensors/esp32/heatindex";
const char* MQTT_TOPIC_PM1 = "sensors/esp32/pm1";
const char* MQTT_TOPIC_PM25 = "sensors/esp32/pm25";
const char* MQTT_TOPIC_PM10 = "sensors/esp32/pm10";
const char* MQTT_TOPIC_STATUS = "sensors/esp32/status";
const char* MQTT_TOPIC_ALL_DATA = "sensors/esp32/all";  // Topic for sending all data as JSON

// Timing configuration
const unsigned long MEASUREMENT_INTERVAL = 60000; // 60 seconds between measurements
const unsigned long WIFI_TIMEOUT = 10000;         // 10 seconds WiFi connection timeout
const unsigned long MQTT_RECONNECT_INTERVAL = 5000; // 5 seconds between MQTT reconnection attempts

// ===========================================
// SENSOR SETUP
// ===========================================
// PMS7003M sensor setup
PMS pms(Serial2);
PMS::DATA data;

// Define connection pins for ESP32
#define PMS_RX_PIN 16  // GPIO16 - connect to TX of PMS7003M
#define PMS_TX_PIN 17  // GPIO17 - connect to RX of PMS7003M

// DHT sensor setup
#define DHTPIN 18      // Digital pin connected to the DHT sensor
#define DHTTYPE DHT22  // DHT 22 (AM2302), AM2321

// Initialize DHT sensor
DHT dht(DHTPIN, DHTTYPE);

// WiFi and MQTT clients
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Time tracking variables
unsigned long lastMeasurement = 0;
unsigned long lastMqttReconnectAttempt = 0;

void setup()
{
  // Serial Monitor with high baud rate for ESP32
  Serial.begin(115200);
  
  // Initialize Serial2 for PMS7003M with specified pins
  Serial2.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  
  // Initialize DHT sensor
  dht.begin();
  
  Serial.println("=== ESP32 Multi-Sensor MQTT Station ===");
  Serial.println("Initializing sensors...");
  Serial.println("- PMS7003M Air Quality Sensor");
  Serial.println("- DHT22 Temperature & Humidity Sensor");
  
  delay(1000); // Wait for sensors to stabilize
  pms.passiveMode();    // Switch PMS to passive mode
  
  // Connect to WiFi
  connectToWiFi();
  
  // Configure MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  
  Serial.println("All sensors and connections are ready!");
  Serial.println("==========================================");
}

void loop()
{
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected! Attempting to reconnect...");
    connectToWiFi();
  }
  
  // Check MQTT connection
  if (!mqttClient.connected()) {
    if (millis() - lastMqttReconnectAttempt > MQTT_RECONNECT_INTERVAL) {
      lastMqttReconnectAttempt = millis();
      connectToMQTT();
    }
  } else {
    mqttClient.loop(); // Maintain MQTT connection
  }
  
  // Perform measurements and send data periodically
  if (millis() - lastMeasurement > MEASUREMENT_INTERVAL) {
    lastMeasurement = millis();
    performMeasurements();
  }
  
  delay(100); // Small delay to prevent overwhelming the system
}

void connectToWiFi()
{
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startTime < WIFI_TIMEOUT) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected successfully!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("");
    Serial.println("Failed to connect to WiFi!");
  }
}

void connectToMQTT()
{
  Serial.print("Attempting MQTT connection to ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.println(MQTT_PORT);
  
  // Set keep alive to 60 seconds (longer than default 15s)
  mqttClient.setKeepAlive(60);
  
  // Attempt to connect
  bool connected = false;
  if (strlen(MQTT_USERNAME) == 0) {
    // Connect without username/password
    connected = mqttClient.connect(MQTT_CLIENT_ID);
  } else {
    // Connect with username/password
    connected = mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD);
  }
  
  if (connected) {
    Serial.println("MQTT connected successfully!");
    
    // Publish connection status
    mqttClient.publish(MQTT_TOPIC_STATUS, "online", true); // retained message
    
  } else {
    Serial.print("MQTT connection failed, rc=");
    Serial.println(mqttClient.state());
    Serial.println("MQTT Error codes:");
    Serial.println("-1: Connection timeout");
    Serial.println("-2: Connection refused - incorrect protocol version");
    Serial.println("-3: Connection refused - invalid client identifier");
    Serial.println("-4: Connection refused - server unavailable");
    Serial.println("-5: Connection refused - bad username or password");
    Serial.println("-6: Connection refused - not authorized");
  }
}

void performMeasurements()
{
  Serial.println("\n=== Starting Measurement Cycle ===");
  
  // Read DHT22 sensor first
  float temperature, humidity, heatIndex;
  bool dhtSuccess = readTemperatureHumidity(temperature, humidity, heatIndex);
  
  // Maintain MQTT connection
  if (mqttClient.connected()) {
    mqttClient.loop();
  }
  
  delay(2000); // Short delay between sensor readings
  
  // Read PMS7003M sensor (with MQTT maintenance built-in)
  uint16_t pm1, pm25, pm10;
  bool pmsSuccess = readAirQuality(pm1, pm25, pm10);
  
  // Ensure MQTT is still connected before sending
  if (!mqttClient.connected()) {
    Serial.println("MQTT disconnected during measurement, attempting reconnect...");
    connectToMQTT();
  }
  
  // Send data to MQTT if connected
  if (mqttClient.connected()) {
    sendDataToMQTT(dhtSuccess, temperature, humidity, heatIndex, 
                   pmsSuccess, pm1, pm25, pm10);
  } else {
    Serial.println("MQTT still not connected - data not sent");
    Serial.println("Will retry on next measurement cycle");
  }
  
  Serial.println("=== Measurement Complete ===");
}

bool readTemperatureHumidity(float &temp, float &hum, float &heatIdx)
{
  Serial.println("--- Temperature & Humidity Data ---");
  
  // Reading temperature or humidity takes about 250 milliseconds!
  hum = dht.readHumidity();
  temp = dht.readTemperature(); // Celsius
  float tempF = dht.readTemperature(true); // Fahrenheit

  // Check if any reads failed
  if (isnan(hum) || isnan(temp) || isnan(tempF)) {
    Serial.println("Failed to read from DHT sensor!");
    return false;
  }

  // Compute heat index in Celsius
  heatIdx = dht.computeHeatIndex(temp, hum, false);
  float heatIdxF = dht.computeHeatIndex(tempF, hum);

  // Display temperature and humidity data
  Serial.print("Humidity: ");
  Serial.print(hum);
  Serial.println("%");
  
  Serial.print("Temperature: ");
  Serial.print(temp);
  Serial.print("°C (");
  Serial.print(tempF);
  Serial.println("°F)");
  
  Serial.print("Heat Index: ");
  Serial.print(heatIdx);
  Serial.print("°C (");
  Serial.print(heatIdxF);
  Serial.println("°F)");
  
  // Evaluate comfort level
  evaluateComfort(temp, hum);
  
  Serial.println("------------------------------------");
  return true;
}

bool readAirQuality(uint16_t &pm1, uint16_t &pm25, uint16_t &pm10)
{
  Serial.println("--- Air Quality Data ---");
  
  Serial.println("Waking up PMS sensor...");
  pms.wakeUp();
  
  // Wait 30 seconds but maintain MQTT connection
  unsigned long startWait = millis();
  while (millis() - startWait < 30000) {
    // Maintain MQTT connection during wait
    if (mqttClient.connected()) {
      mqttClient.loop();
    } else if (millis() - lastMqttReconnectAttempt > MQTT_RECONNECT_INTERVAL) {
      lastMqttReconnectAttempt = millis();
      connectToMQTT();
    }
    delay(100); // Small delay
  }

  Serial.println("Requesting air quality data...");
  pms.requestRead();

  // Try reading multiple times with MQTT maintenance
  int readAttempts = 0;
  while (readAttempts < 5) {
    // Maintain MQTT during read attempts
    if (mqttClient.connected()) {
      mqttClient.loop();
    }
    
    if (pms.readUntil(data, 2000)) { // 2 second timeout per attempt
      pm1 = data.PM_AE_UG_1_0;
      pm25 = data.PM_AE_UG_2_5;
      pm10 = data.PM_AE_UG_10_0;
      
      Serial.print("PM 1.0: ");
      Serial.print(pm1);
      Serial.println(" μg/m³");

      Serial.print("PM 2.5: ");
      Serial.print(pm25);
      Serial.println(" μg/m³");

      Serial.print("PM 10.0: ");
      Serial.print(pm10);
      Serial.println(" μg/m³");
      
      // Evaluate air quality
      evaluateAirQuality(pm25);
      
      Serial.println("Putting PMS sensor to sleep...");
      pms.sleep();
      Serial.println("-------------------------");
      return true;
    }
    
    readAttempts++;
    Serial.print("Read attempt ");
    Serial.print(readAttempts);
    Serial.println(" failed, retrying...");
    delay(1000);
  }
  
  Serial.println("Failed to read from PMS sensor after 5 attempts!");
  Serial.println("Putting PMS sensor to sleep...");
  pms.sleep();
  Serial.println("-------------------------");
  return false;
}

void sendDataToMQTT(bool dhtValid, float temp, float hum, float heatIdx,
                    bool pmsValid, uint16_t pm1, uint16_t pm25, uint16_t pm10)
{
  Serial.println("--- Sending Data to MQTT ---");
  
  // Send individual sensor data
  if (dhtValid) {
    mqttClient.publish(MQTT_TOPIC_TEMPERATURE, String(temp, 2).c_str());
    mqttClient.publish(MQTT_TOPIC_HUMIDITY, String(hum, 2).c_str());
    mqttClient.publish(MQTT_TOPIC_HEAT_INDEX, String(heatIdx, 2).c_str());
    Serial.println("DHT22 data sent to MQTT");
  }
  
  if (pmsValid) {
    mqttClient.publish(MQTT_TOPIC_PM1, String(pm1).c_str());
    mqttClient.publish(MQTT_TOPIC_PM25, String(pm25).c_str());
    mqttClient.publish(MQTT_TOPIC_PM10, String(pm10).c_str());
    Serial.println("PMS7003M data sent to MQTT");
  }
  
  // Send all data as JSON
  StaticJsonDocument<300> jsonDoc;
  JsonObject root = jsonDoc.to<JsonObject>();
  
  // Add timestamp
  root["timestamp"] = millis();
  root["device_id"] = MQTT_CLIENT_ID;
  
  if (dhtValid) {
    JsonObject climate = root.createNestedObject("climate");
    climate["temperature"] = round(temp * 100) / 100.0; // 2 decimal places
    climate["humidity"] = round(hum * 100) / 100.0;
    climate["heat_index"] = round(heatIdx * 100) / 100.0;
    climate["comfort"] = getComfortStatus(temp, hum);
  }
  
  if (pmsValid) {
    JsonObject airquality = root.createNestedObject("air_quality");
    airquality["pm1"] = pm1;
    airquality["pm25"] = pm25;
    airquality["pm10"] = pm10;
    airquality["aqi_status"] = getAQIStatus(pm25);
  }
  
  // Convert JSON to string and publish
  String jsonString;
  serializeJson(jsonDoc, jsonString);
  mqttClient.publish(MQTT_TOPIC_ALL_DATA, jsonString.c_str());
  
  Serial.println("JSON data sent to MQTT:");
  Serial.println(jsonString);
  Serial.println("-----------------------------");
}

String getComfortStatus(float temperature, float humidity)
{
  bool tempComfortable = (temperature >= 20.0 && temperature <= 26.0);
  bool humidityComfortable = (humidity >= 40.0 && humidity <= 60.0);
  
  if (tempComfortable && humidityComfortable) {
    return "comfortable";
  } else if (tempComfortable || humidityComfortable) {
    return "moderate";
  } else {
    return "uncomfortable";
  }
}

String getAQIStatus(uint16_t pm25)
{
  if (pm25 <= 12) {
    return "good";
  } else if (pm25 <= 35) {
    return "moderate";
  } else if (pm25 <= 55) {
    return "unhealthy_sensitive";
  } else if (pm25 <= 150) {
    return "unhealthy";
  } else if (pm25 <= 250) {
    return "very_unhealthy";
  } else {
    return "hazardous";
  }
}

void evaluateAirQuality(uint16_t pm25) 
{
  Serial.print("Air Quality Status: ");
  
  if (pm25 <= 12) {
    Serial.println("Good ✓");
  } else if (pm25 <= 35) {
    Serial.println("Moderate ⚠");
  } else if (pm25 <= 55) {
    Serial.println("Unhealthy for Sensitive Groups ⚠");
  } else if (pm25 <= 150) {
    Serial.println("Unhealthy ✗");
  } else if (pm25 <= 250) {
    Serial.println("Very Unhealthy ✗✗");
  } else {
    Serial.println("Hazardous ✗✗✗");
  }
}

void evaluateComfort(float temperature, float humidity)
{
  Serial.print("Comfort Level: ");
  
  // Temperature comfort range: 20-26°C
  // Humidity comfort range: 40-60%
  
  bool tempComfortable = (temperature >= 20.0 && temperature <= 26.0);
  bool humidityComfortable = (humidity >= 40.0 && humidity <= 60.0);
  
  if (tempComfortable && humidityComfortable) {
    Serial.println("Comfortable ✓");
  } else if (tempComfortable || humidityComfortable) {
    Serial.println("Moderately Comfortable ⚠");
  } else {
    Serial.println("Uncomfortable ✗");
    
    // Additional feedback
    if (temperature < 20.0) {
      Serial.println("  • Temperature too cold");
    } else if (temperature > 26.0) {
      Serial.println("  • Temperature too hot");
    }
    
    if (humidity < 40.0) {
      Serial.println("  • Air too dry");
    } else if (humidity > 60.0) {
      Serial.println("  • Air too humid");
    }
  }
}