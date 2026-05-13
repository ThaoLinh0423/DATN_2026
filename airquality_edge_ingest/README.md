# airquality_edge_ingest
IoT pipeline for collecting and ingesting Air Quality sensor data from edge devices


## Folder structure

```
air_quality_data_platform/
│
├── esp32_firmware/                # Code for ESP32 (sensor firmware)
│   ├── dht22_test.ino
│   └── README.md
│
├── docker/                        # Docker/Docker Compose services
│   ├── docker-compose.yml         # Main Docker Compose file
│   ├── influxdb/                  # InfluxDB configuration and volumes
│   │   └── influxdb.conf
│   ├── grafana/                   # Grafana configuration and dashboards
│   │   └── provisioning/
│   ├── telegraf/                  # Telegraf configuration for ingesting MQTT data
│   │   └── telegraf.conf
│   └── mosquitto/                 # MQTT configuration
│       └── mosquitto.conf
│
├── test/                          # Used to store test scripts
│
├── .env                           # Environment configuration (MQTT, DB, etc.)
├── README.md
└── LICENSE
``` 