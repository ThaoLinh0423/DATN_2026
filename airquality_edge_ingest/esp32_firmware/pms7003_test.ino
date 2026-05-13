#include "PMS.h"

// Using Serial2 for ESP32 instead of Serial
PMS pms(Serial2);
PMS::DATA data;

// Define connection pins for ESP32
#define PMS_RX_PIN 16  // GPIO16 - connect to TX of PMS7003M
#define PMS_TX_PIN 17  // GPIO17 - connect to RX of PMS7003M

void setup()
{
  // Serial Monitor with higher baud rate for ESP32
  Serial.begin(115200);
  
  // Initialize Serial2 for PMS7003M with specified pins
  Serial2.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  
  Serial.println("=== ESP32 PMS7003M Sensor ===");
  Serial.println("Initializing passive mode...");
  
  delay(1000); // Wait for serial to stabilize
  pms.passiveMode();    // Switch to passive mode
  
  Serial.println("Sensor is ready!");
}

void loop()
{
  Serial.println("Waking up sensor, waiting 30 seconds for stable readings...");
  pms.wakeUp();
  delay(30000);

  Serial.println("Sending read request...");
  pms.requestRead();

  Serial.println("Reading data...");
  if (pms.readUntil(data))
  {
    Serial.println("=== Air Quality Data ===");
    
    Serial.print("PM 1.0 (μg/m³): ");
    Serial.println(data.PM_AE_UG_1_0);

    Serial.print("PM 2.5 (μg/m³): ");
    Serial.println(data.PM_AE_UG_2_5);

    Serial.print("PM 10.0 (μg/m³): ");
    Serial.println(data.PM_AE_UG_10_0);
    
    // Add air quality evaluation
    evaluateAirQuality(data.PM_AE_UG_2_5);
    
    Serial.println("----------------------------------------");
  }
  else
  {
    Serial.println("No data from sensor.");
  }

  Serial.println("Putting sensor to sleep for 60 seconds.");
  pms.sleep();
  delay(60000);
}

void evaluateAirQuality(uint16_t pm25) {
  Serial.print("Air Quality: ");
  
  if (pm25 <= 12) {
    Serial.println("Good");
  } else if (pm25 <= 35) {
    Serial.println("Moderate");
  } else if (pm25 <= 55) {
    Serial.println("Unhealthy for Sensitive Groups");
  } else if (pm25 <= 150) {
    Serial.println("Unhealthy");
  } else if (pm25 <= 250) {
    Serial.println("Very Unhealthy");
  } else {
    Serial.println("Hazardous");
  }
}