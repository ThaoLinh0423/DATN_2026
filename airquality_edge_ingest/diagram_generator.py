"""
AirQuality Edge Ingest - System Diagram Generator
Generates firmware processing flow and system architecture diagrams
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

# Color palette
COLORS = {
    'esp32': '#4A90D9',
    'sensor': '#50C878',
    'mqtt': '#FF9500',
    'data_layer': '#9B59B6',
    'storage': '#E74C3C',
    'visualization': '#1ABC9C',
    'network': '#34495E',
    'arrow': '#2C3E50',
    'text': '#2C3E50',
    'bg': '#FAFAFA',
    'box_bg': '#FFFFFF',
}


def draw_firmware_flow():
    """
    Draw firmware processing flow for each measurement cycle at transmission layer
    """
    fig, ax = plt.subplots(1, 1, figsize=(20, 28))
    ax.set_xlim(0, 20)
    ax.set_ylim(0, 28)
    ax.axis('off')
    ax.set_facecolor(COLORS['bg'])
    fig.patch.set_facecolor(COLORS['bg'])

    # Title
    ax.text(10, 27.3, 'ESP32 Firmware - Measurement Cycle Processing Flow',
            fontsize=18, fontweight='bold', ha='center', color=COLORS['text'])
    ax.text(10, 26.8, 'Transmission Layer - Every 60 Seconds per Cycle',
            fontsize=12, ha='center', color='#666666')

    y_pos = 26.0
    box_width = 3.2
    box_height = 0.9
    small_box = 2.4
    arrow_color = COLORS['arrow']

    # ========== PHASE 1: SETUP ==========
    ax.text(1, y_pos, 'PHASE 1: SETUP (One Time on Boot)',
            fontsize=11, fontweight='bold', color='#2C3E50',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#E8E8E8', edgecolor='none'))

    y_pos -= 1.2
    setup_items = [
        ('Initialize Serial2\n(PMS7003 @ 9600)', COLORS['sensor']),
        ('Initialize DHT22\nSensor', COLORS['sensor']),
        ('Initialize WiFi\nClient', COLORS['network']),
        ('Connect to WiFi\nNetwork', COLORS['network']),
        ('Configure MQTT\nServer & Topics', COLORS['mqtt']),
        ('Connect to MQTT\nBroker', COLORS['mqtt']),
    ]

    for i, (text, color) in enumerate(setup_items):
        x = 1 + (i % 3) * 6.2
        y = y_pos - (i // 3) * 1.3
        rect = FancyBboxPatch((x, y), small_box, box_height,
                              boxstyle="round,pad=0.05,rounding_size=0.1",
                              facecolor=color, edgecolor='white', linewidth=2, alpha=0.9)
        ax.add_patch(rect)
        ax.text(x + small_box/2, y + box_height/2, text,
                fontsize=8, ha='center', va='center', color='white', fontweight='bold')
        if i > 0:
            ax.annotate('', xy=(x, y + box_height/2), xytext=(x - 1.5, y + box_height/2),
                       arrowprops=dict(arrowstyle='->', color=arrow_color, lw=1.5))

    y_pos -= 3.3

    # ========== PHASE 2: LOOP MONITORING ==========
    ax.text(1, y_pos, 'PHASE 2: MAIN LOOP (Continuous Monitoring)',
            fontsize=11, fontweight='bold', color='#2C3E50',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#E8E8E8', edgecolor='none'))

    y_pos -= 1.0

    # WiFi Check
    wifi_check = FancyBboxPatch((1, y_pos), 5.5, 1.0,
                                boxstyle="round,pad=0.05,rounding_size=0.1",
                                facecolor=COLORS['network'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(wifi_check)
    ax.text(3.75, y_pos + 0.5, 'WiFi Connected?', fontsize=9, ha='center', va='center',
            color='white', fontweight='bold')

    ax.text(7, y_pos + 0.5, 'NO', fontsize=8, ha='left', va='center', color='red', fontweight='bold')
    ax.annotate('', xy=(7, y_pos + 0.5), xytext=(6.5, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color='red', lw=1.5))

    # Reconnect WiFi box
    rect = FancyBboxPatch((7.2, y_pos), 2.5, 1.0,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor='#E74C3C', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(8.45, y_pos + 0.5, 'Reconnect\nWiFi', fontsize=8, ha='center', va='center',
            color='white', fontweight='bold')

    ax.annotate('', xy=(9.7, y_pos + 0.5), xytext=(9.5, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=1.5))

    # MQTT Check
    mqtt_check = FancyBboxPatch((10, y_pos), 5.5, 1.0,
                                boxstyle="round,pad=0.05,rounding_size=0.1",
                                facecolor=COLORS['mqtt'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(mqtt_check)
    ax.text(12.75, y_pos + 0.5, 'MQTT Connected?', fontsize=9, ha='center', va='center',
            color='white', fontweight='bold')

    ax.text(16, y_pos + 0.5, 'NO', fontsize=8, ha='left', va='center', color='red', fontweight='bold')
    ax.annotate('', xy=(16, y_pos + 0.5), xytext=(15.5, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color='red', lw=1.5))

    # Reconnect MQTT box
    rect = FancyBboxPatch((16.2, y_pos), 2.5, 1.0,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor='#E74C3C', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(17.45, y_pos + 0.5, 'Reconnect\nMQTT', fontsize=8, ha='center', va='center',
            color='white', fontweight='bold')

    ax.annotate('', xy=(10, y_pos + 0.5), xytext=(9.5, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=1.5))

    y_pos -= 1.5

    # YES paths merge
    ax.text(3.75, y_pos + 0.5, 'YES', fontsize=8, ha='right', va='center', color='green', fontweight='bold')
    ax.text(12.75, y_pos + 0.5, 'YES', fontsize=8, ha='right', va='center', color='green', fontweight='bold')

    # Time check
    time_check = FancyBboxPatch((6, y_pos - 0.3), 8, 1.2,
                                boxstyle="round,pad=0.05,rounding_size=0.1",
                                facecolor=COLORS['esp32'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(time_check)
    ax.text(10, y_pos + 0.3, 'Time since last measurement > 60s?', fontsize=10, ha='center', va='center',
            color='white', fontweight='bold')

    ax.annotate('', xy=(10, y_pos + 0.6), xytext=(3.75, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=1.5))
    ax.annotate('', xy=(10, y_pos + 0.6), xytext=(12.75, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=1.5))

    y_pos -= 1.8
    ax.text(10, y_pos + 0.3, 'NO -> Continue loop / YES -> Perform Measurement', fontsize=9, ha='center', va='center', color='#666666')

    y_pos -= 1.0

    # ========== PHASE 3: MEASUREMENT CYCLE ==========
    ax.text(1, y_pos, 'PHASE 3: MEASUREMENT CYCLE (performMeasurements)',
            fontsize=11, fontweight='bold', color='#2C3E50',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#FFE0B2', edgecolor='none'))

    y_pos -= 1.2

    # Step 1: Read DHT22
    rect = FancyBboxPatch((1, y_pos), box_width, box_height,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor=COLORS['sensor'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(1 + box_width/2, y_pos + box_height/2, '1. Read DHT22\nSensor\n\nTemp/Humidity\nHeat Index',
            fontsize=8, ha='center', va='center', color='white', fontweight='bold')

    # Arrow
    ax.annotate('', xy=(5, y_pos + box_height/2), xytext=(4.2, y_pos + box_height/2),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    # Step 2: Delay 2s
    rect = FancyBboxPatch((5.3, y_pos), 1.8, box_height,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor='#95A5A6', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(6.2, y_pos + box_height/2, '2. Wait\n2 seconds',
            fontsize=8, ha='center', va='center', color='white', fontweight='bold')

    # Arrow
    ax.annotate('', xy=(7.9, y_pos + box_height/2), xytext=(7.1, y_pos + box_height/2),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    # Step 3: Wake up PMS
    rect = FancyBboxPatch((8.2, y_pos), box_width, box_height,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor=COLORS['sensor'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(8.2 + box_width/2, y_pos + box_height/2, '3. Wake Up\nPMS7003\nSensor',
            fontsize=8, ha='center', va='center', color='white', fontweight='bold')

    # Arrow
    ax.annotate('', xy=(12.2, y_pos + box_height/2), xytext=(11.4, y_pos + box_height/2),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    # Step 4: Warmup 30s
    rect = FancyBboxPatch((12.5, y_pos), 2.2, box_height,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor='#95A5A6', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(13.6, y_pos + box_height/2, '4. Warmup\n30 seconds\n+ MQTT loop',
            fontsize=8, ha='center', va='center', color='white', fontweight='bold')

    # Arrow
    ax.annotate('', xy=(15.5, y_pos + box_height/2), xytext=(14.7, y_pos + box_height/2),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    # Step 5: Request Read
    rect = FancyBboxPatch((15.8, y_pos), box_width, box_height,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor=COLORS['sensor'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(15.8 + box_width/2, y_pos + box_height/2, '5. Request\nAir Quality\nData',
            fontsize=8, ha='center', va='center', color='white', fontweight='bold')

    y_pos -= 1.8

    # Step 6: Read PM values (with retry)
    rect = FancyBboxPatch((4, y_pos), 4.5, 1.3,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor=COLORS['sensor'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(6.25, y_pos + 1.0, '6. Read PM Data\n(PM1.0, PM2.5, PM10)',
            fontsize=9, ha='center', va='center', color='white', fontweight='bold')
    ax.text(6.25, y_pos + 0.4, 'Retry up to 5 times if failed',
            fontsize=7, ha='center', va='center', color='#CCCCCC')

    ax.annotate('', xy=(6.25, y_pos + 1.3), xytext=(6.25, y_pos + 0.9 + 0.1),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    ax.annotate('', xy=(4 + 4.5, y_pos + 1.3/2), xytext=(4.2 + box_width, y_pos + box_height/2),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    # Step 7: Sleep PMS
    rect = FancyBboxPatch((10, y_pos), 3, 1.3,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor='#7F8C8D', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(11.5, y_pos + 1.0, '7. Put PMS7003\nto Sleep',
            fontsize=9, ha='center', va='center', color='white', fontweight='bold')
    ax.text(11.5, y_pos + 0.4, '(Power saving)',
            fontsize=7, ha='center', va='center', color='#CCCCCC')

    ax.annotate('', xy=(10, y_pos + 1.3/2), xytext=(8.5, y_pos + 1.3/2),
               arrowprops=dict(arrowstyle='->', color=arrow_color, lw=2))

    y_pos -= 2.0

    # ========== PHASE 4: DATA TRANSMISSION ==========
    ax.text(1, y_pos, 'PHASE 4: DATA TRANSMISSION (MQTT Publish)',
            fontsize=11, fontweight='bold', color='#2C3E50',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#E1BEE7', edgecolor='none'))

    y_pos -= 1.2

    # MQTT Connection check
    mqtt_final = FancyBboxPatch((1, y_pos), 4.5, 1.0,
                                boxstyle="round,pad=0.05,rounding_size=0.1",
                                facecolor=COLORS['mqtt'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(mqtt_final)
    ax.text(3.25, y_pos + 0.5, 'MQTT Still\nConnected?',
            fontsize=9, ha='center', va='center', color='white', fontweight='bold')

    ax.text(5.8, y_pos + 0.5, 'NO -> Reconnect', fontsize=8, ha='left', va='center', color='red', fontweight='bold')
    ax.annotate('', xy=(6.1, y_pos + 0.5), xytext=(5.5, y_pos + 0.5),
               arrowprops=dict(arrowstyle='->', color='red', lw=1.5))

    # Reconnect
    rect = FancyBboxPatch((6.3, y_pos), 2.2, 1.0,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor='#E74C3C', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    ax.text(7.4, y_pos + 0.5, 'Reconnect\nMQTT',
            fontsize=8, ha='center', va='center', color='white', fontweight='bold')

    ax.annotate('', xy=(3.25, y_pos + 1.0), xytext=(7.4, y_pos + 1.0),
               arrowprops=dict(arrowstyle='->', color='green', lw=1.5))

    y_pos -= 1.5

    # Publish individual topics
    ax.text(1, y_pos + 0.5, 'Publish Individual Topics:', fontsize=9, fontweight='bold', color=COLORS['text'])

    topics = [
        ('sensors/esp32/\ntemperature', '#4A90D9'),
        ('sensors/esp32/\nhumidity', '#50C878'),
        ('sensors/esp32/\nheatindex', '#FF9500'),
        ('sensors/esp32/\npm1', '#9B59B6'),
        ('sensors/esp32/\npm25', '#E74C3C'),
        ('sensors/esp32/\npm10', '#1ABC9C'),
    ]

    for i, (topic, color) in enumerate(topics):
        x = 1 + (i % 3) * 3.0
        y = y_pos - 0.3 - (i // 3) * 1.1
        rect = FancyBboxPatch((x, y), 2.6, 0.9,
                              boxstyle="round,pad=0.05,rounding_size=0.1",
                              facecolor=color, edgecolor='white', linewidth=2, alpha=0.85)
        ax.add_patch(rect)
        ax.text(x + 1.3, y + 0.45, topic,
                fontsize=7, ha='center', va='center', color='white', fontweight='bold')

        if i == 0:
            ax.annotate('', xy=(x + 1.3, y + 0.9), xytext=(3.25, y_pos + 1.0),
                       arrowprops=dict(arrowstyle='->', color=arrow_color, lw=1.5))

    y_pos -= 3.0

    # JSON combined topic
    ax.text(1, y_pos + 0.5, 'Publish Combined JSON:', fontsize=9, fontweight='bold', color=COLORS['text'])

    json_box = FancyBboxPatch((1, y_pos - 0.7), 18, 1.5,
                              boxstyle="round,pad=0.05,rounding_size=0.1",
                              facecolor=COLORS['esp32'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(json_box)

    json_text = '''Topic: sensors/esp32/all
{"timestamp": <millis>, "device_id": "ESP32_Sensor_001",
  "climate": {"temperature": <float>, "humidity": <float>, "heat_index": <float>, "comfort": "<status>"},
  "air_quality": {"pm1": <int>, "pm25": <int>, "pm10": <int>, "aqi_status": "<status>"}}}'''

    ax.text(10, y_pos + 0.1, json_text,
            fontsize=7, ha='center', va='center', color='white', fontfamily='monospace')

    y_pos -= 3.0

    # ========== LEGEND ==========
    legend_y = 2.5
    ax.text(1, legend_y, 'Legend:', fontsize=10, fontweight='bold', color=COLORS['text'])

    legend_items = [
        (COLORS['esp32'], 'ESP32 Processor'),
        (COLORS['sensor'], 'Sensor Devices'),
        (COLORS['network'], 'Network/WiFi'),
        (COLORS['mqtt'], 'MQTT Protocol'),
        ('#95A5A6', 'Delay/Wait'),
        ('#7F8C8D', 'Power Management'),
    ]

    for i, (color, label) in enumerate(legend_items):
        x = 1 + (i % 3) * 6
        y = legend_y - 0.8 - (i // 3) * 0.7
        rect = FancyBboxPatch((x, y), 0.5, 0.4,
                              boxstyle="round,pad=0.02,rounding_size=0.05",
                              facecolor=color, edgecolor='white', linewidth=1, alpha=0.9)
        ax.add_patch(rect)
        ax.text(x + 0.7, y + 0.2, label, fontsize=8, va='center', color=COLORS['text'])

    # Timing info
    ax.text(1, 0.8, 'Timing: Setup ~2-3s | Loop interval: 100ms | Measurement cycle: 60s | PMS warmup: 30s',
            fontsize=8, ha='left', color='#666666', style='italic')

    plt.tight_layout()
    plt.savefig('d:/DoAnTotNghiep/DATN_v1/airquality_edge_ingest/firmware_flow_diagram.png',
                dpi=150, bbox_inches='tight', facecolor=COLORS['bg'])
    plt.close()
    print("Firmware flow diagram saved!")


def draw_system_architecture():
    """
    Draw complete data storage and management system architecture
    """
    fig, ax = plt.subplots(1, 1, figsize=(18, 14))
    ax.set_xlim(0, 18)
    ax.set_ylim(0, 14)
    ax.axis('off')
    ax.set_facecolor(COLORS['bg'])
    fig.patch.set_facecolor(COLORS['bg'])

    # Title
    ax.text(9, 13.3, 'Air Quality Edge Ingest - System Architecture',
            fontsize=18, fontweight='bold', ha='center', color=COLORS['text'])
    ax.text(9, 12.9, 'Complete Data Flow: Sensors -> Edge -> Cloud -> Visualization',
            fontsize=11, ha='center', color='#666666')

    # ========== EDGE DEVICE LAYER ==========
    ax.text(1, 12.2, 'EDGE DEVICE LAYER',
            fontsize=11, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.4', facecolor=COLORS['esp32'], edgecolor='none'))

    # ESP32 Box
    esp32 = FancyBboxPatch((1.5, 10.8), 3, 1.2,
                           boxstyle="round,pad=0.05,rounding_size=0.15",
                           facecolor=COLORS['esp32'], edgecolor='white', linewidth=3)
    ax.add_patch(esp32)
    ax.text(3, 11.4, 'ESP32\nMicrocontroller', fontsize=10, ha='center', va='center',
            color='white', fontweight='bold')

    # Sensors
    sensors = [
        ('DHT22', 'Temp/Humidity', 1.5, 9.3),
        ('PMS7003', 'PM Sensor', 3.2, 9.3),
    ]

    for name, desc, x, y in sensors:
        rect = FancyBboxPatch((x, y), 1.4, 1.0,
                              boxstyle="round,pad=0.05,rounding_size=0.1",
                              facecolor=COLORS['sensor'], edgecolor='white', linewidth=2, alpha=0.9)
        ax.add_patch(rect)
        ax.text(x + 0.7, y + 0.65, name, fontsize=9, ha='center', va='center',
                color='white', fontweight='bold')
        ax.text(x + 0.7, y + 0.25, desc, fontsize=7, ha='center', va='center',
                color='white')

        # Arrow from sensor to ESP32
        ax.annotate('', xy=(3, 11.0), xytext=(x + 0.7, y + 1.0),
                   arrowprops=dict(arrowstyle='->', color=COLORS['sensor'], lw=2))

    # ========== TRANSMISSION LAYER ==========
    ax.text(1, 8.3, 'TRANSMISSION LAYER',
            fontsize=11, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.4', facecolor=COLORS['network'], edgecolor='none'))

    # WiFi
    wifi = FancyBboxPatch((2, 6.8), 2.2, 1.0,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor=COLORS['network'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(wifi)
    ax.text(3.1, 7.3, 'WiFi\n802.11', fontsize=9, ha='center', va='center',
            color='white', fontweight='bold')

    # Arrow ESP32 -> WiFi
    ax.annotate('', xy=(3.1, 6.9), xytext=(3, 10.8),
               arrowprops=dict(arrowstyle='->', color=COLORS['network'], lw=2))

    # MQTT Broker (Mosquitto)
    mqtt = FancyBboxPatch((5.5, 6.8), 2.8, 1.0,
                          boxstyle="round,pad=0.05,rounding_size=0.1",
                          facecolor=COLORS['mqtt'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(mqtt)
    ax.text(6.9, 7.3, 'Mosquitto\nMQTT Broker', fontsize=9, ha='center', va='center',
            color='white', fontweight='bold')
    ax.text(6.9, 6.95, 'Port 1883 / 9001', fontsize=7, ha='center', va='center',
            color='white', alpha=0.8)

    # Arrow WiFi -> MQTT
    ax.annotate('', xy=(5.8, 7.3), xytext=(4.2, 7.3),
               arrowprops=dict(arrowstyle='->', color=COLORS['mqtt'], lw=2))

    # ========== DATA SERVICES LAYER ==========
    ax.text(1, 5.8, 'DATA SERVICES LAYER (Docker Container)',
            fontsize=11, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.4', facecolor=COLORS['data_layer'], edgecolor='none'))

    # Telegraf
    telegraf = FancyBboxPatch((1.5, 4.3), 2.5, 1.2,
                              boxstyle="round,pad=0.05,rounding_size=0.1",
                              facecolor='#4682B4', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(telegraf)
    ax.text(2.75, 4.9, 'Telegraf', fontsize=10, ha='center', va='center',
            color='white', fontweight='bold')
    ax.text(2.75, 4.5, 'MQTT Consumer', fontsize=8, ha='center', va='center',
            color='white', alpha=0.8)
    ax.text(2.75, 4.2, '-> InfluxDB Output', fontsize=7, ha='center', va='center',
            color='#CCCCCC')

    # Arrow MQTT -> Telegraf
    ax.annotate('', xy=(2.75, 4.4), xytext=(6.9, 6.8),
               arrowprops=dict(arrowstyle='->', color='#4682B4', lw=2,
                              connectionstyle='arc3,rad=-0.2'))

    # InfluxDB
    influxdb = FancyBboxPatch((5, 4.3), 2.8, 1.2,
                              boxstyle="round,pad=0.05,rounding_size=0.1",
                              facecolor=COLORS['storage'], edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(influxdb)
    ax.text(6.4, 4.9, 'InfluxDB', fontsize=10, ha='center', va='center',
            color='white', fontweight='bold')
    ax.text(6.4, 4.5, 'Time-Series DB', fontsize=8, ha='center', va='center',
            color='white', alpha=0.8)
    ax.text(6.4, 4.2, 'Port 8086', fontsize=7, ha='center', va='center',
            color='#CCCCCC')

    # Arrow Telegraf -> InfluxDB
    ax.annotate('', xy=(5.3, 4.9), xytext=(5, 4.9),
               arrowprops=dict(arrowstyle='->', color=COLORS['storage'], lw=2))

    # Chronograf
    chronograf = FancyBboxPatch((8.8, 4.3), 2.5, 1.2,
                                boxstyle="round,pad=0.05,rounding_size=0.1",
                                facecolor='#336791', edgecolor='white', linewidth=2, alpha=0.9)
    ax.add_patch(chronograf)
    ax.text(10.05, 4.9, 'Chronograf', fontsize=10, ha='center', va='center',
            color='white', fontweight='bold')
    ax.text(10.05, 4.5, 'InfluxDB UI', fontsize=8, ha='center', va='center',
            color='white', alpha=0.8)
    ax.text(10.05, 4.2, 'Port 8888', fontsize=7, ha='center', va='center',
            color='#CCCCCC')

    # Arrow InfluxDB -> Chronograf
    ax.annotate('', xy=(9.1, 4.9), xytext=(8.5, 4.9),
               arrowprops=dict(arrowstyle='->', color='#336791', lw=2))

    # ========== VISUALIZATION LAYER ==========
    ax.text(1, 3.3, 'VISUALIZATION LAYER',
            fontsize=11, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.4', facecolor=COLORS['visualization'], edgecolor='none'))

    # Grafana
    grafana = FancyBboxPatch((5, 1.8), 3, 1.3,
                             boxstyle="round,pad=0.05,rounding_size=0.1",
                             facecolor=COLORS['visualization'], edgecolor='white', linewidth=3, alpha=0.9)
    ax.add_patch(grafana)
    ax.text(6.5, 2.7, 'Grafana', fontsize=12, ha='center', va='center',
            color='white', fontweight='bold')
    ax.text(6.5, 2.3, 'Dashboards & Alerts', fontsize=9, ha='center', va='center',
            color='white', alpha=0.9)
    ax.text(6.5, 1.95, 'Port 3001', fontsize=8, ha='center', va='center',
            color='white', alpha=0.7)

    # Arrow InfluxDB -> Grafana
    ax.annotate('', xy=(6.5, 3.1), xytext=(6.4, 4.3),
               arrowprops=dict(arrowstyle='->', color=COLORS['visualization'], lw=2))

    # Arrow Chronograf -> Grafana (dashed)
    ax.annotate('', xy=(8.8, 3.1), xytext=(8.8, 4.3),
               arrowprops=dict(arrowstyle='->', color='#336791', lw=1.5, linestyle='dashed'))

    # ========== DATA FLOW INDICATORS ==========
    ax.text(12.5, 12.2, 'DATA FLOW',
            fontsize=11, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#2C3E50', edgecolor='none'))

    flow_steps = [
        ('1. Sensors collect\nanalog/digital data', 0),
        ('2. ESP32 reads via\nSerial (9600 baud)', 1),
        ('3. Data processed\n& formatted', 2),
        ('4. MQTT publish to\nMosquitto broker', 3),
        ('5. Telegraf consumes\nMQTT messages', 4),
        ('6. Telegraf writes\nto InfluxDB', 5),
        ('7. Grafana queries\n& visualizes', 6),
    ]

    for text, i in flow_steps:
        y = 10.5 - i * 1.3
        rect = FancyBboxPatch((12.5, y - 0.4), 4.5, 1.0,
                              boxstyle="round,pad=0.03,rounding_size=0.08",
                              facecolor='#34495E', edgecolor='white', linewidth=1, alpha=0.8)
        ax.add_patch(rect)
        ax.text(14.75, y + 0.1, text, fontsize=7, ha='center', va='center',
                color='white', fontweight='bold')

    # ========== PROTOCOLS & PORTS ==========
    ax.text(12.5, 3.0, 'PROTOCOLS & PORTS',
            fontsize=10, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#7F8C8D', edgecolor='none'))

    protocols = [
        ('MQTT', '1883', COLORS['mqtt']),
        ('WebSocket', '9001', COLORS['mqtt']),
        ('InfluxDB', '8086', COLORS['storage']),
        ('Chronograf', '8888', '#336791'),
        ('Grafana', '3001', COLORS['visualization']),
    ]

    for i, (proto, port, color) in enumerate(protocols):
        y = 2.0 - i * 0.5
        rect = FancyBboxPatch((12.5, y), 1.8, 0.4,
                              boxstyle="round,pad=0.02,rounding_size=0.05",
                              facecolor=color, edgecolor='white', linewidth=1, alpha=0.9)
        ax.add_patch(rect)
        ax.text(13.4, y + 0.2, proto, fontsize=7, ha='center', va='center',
                color='white', fontweight='bold')
        ax.text(14.5, y + 0.2, port, fontsize=7, ha='center', va='center',
                color='white', alpha=0.8)

    # ========== DOCKER NETWORK ==========
    network_box = FancyBboxPatch((1, 0.3), 10.5, 0.8,
                                 boxstyle="round,pad=0.05,rounding_size=0.1",
                                 facecolor='#2C3E50', edgecolor='#34495E', linewidth=2, alpha=0.9)
    ax.add_patch(network_box)
    ax.text(6.25, 0.7, 'Docker Network: data_services_network (bridge driver)',
            fontsize=9, ha='center', va='center', color='white')

    plt.tight_layout()
    plt.savefig('d:/DoAnTotNghiep/DATN_v1/airquality_edge_ingest/system_architecture_diagram.png',
                dpi=150, bbox_inches='tight', facecolor=COLORS['bg'])
    plt.close()
    print("System architecture diagram saved!")


def draw_data_format_detail():
    """
    Draw detailed data format for MQTT messages
    """
    fig, ax = plt.subplots(1, 1, figsize=(16, 10))
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 10)
    ax.axis('off')
    ax.set_facecolor(COLORS['bg'])
    fig.patch.set_facecolor(COLORS['bg'])

    ax.text(8, 9.5, 'MQTT Data Format Specification',
            fontsize=16, fontweight='bold', ha='center', color=COLORS['text'])

    # Individual Topics
    ax.text(1, 8.7, 'Individual MQTT Topics:', fontsize=12, fontweight='bold', color=COLORS['esp32'])

    topics_data = [
        ('sensors/esp32/temperature', 'float', 'C', '20.50', COLORS['esp32']),
        ('sensors/esp32/humidity', 'float', '%', '65.30', COLORS['sensor']),
        ('sensors/esp32/heatindex', 'float', 'C', '22.10', COLORS['sensor']),
        ('sensors/esp32/pm1', 'uint16', 'ug/m3', '12', COLORS['data_layer']),
        ('sensors/esp32/pm25', 'uint16', 'ug/m3', '25', COLORS['storage']),
        ('sensors/esp32/pm10', 'uint16', 'ug/m3', '45', COLORS['visualization']),
        ('sensors/esp32/status', 'string', '-', 'online', COLORS['mqtt']),
    ]

    y = 8.2
    for topic, dtype, unit, example, color in topics_data:
        rect = FancyBboxPatch((1, y - 0.5), 7, 0.55,
                              boxstyle="round,pad=0.03,rounding_size=0.08",
                              facecolor=color, edgecolor='white', linewidth=1, alpha=0.9)
        ax.add_patch(rect)
        ax.text(1.2, y - 0.2, topic, fontsize=8, ha='left', va='center',
                color='white', fontfamily='monospace', fontweight='bold')
        ax.text(8.2, y - 0.2, dtype + ' ' + unit, fontsize=8, ha='left', va='center',
                color='white')
        ax.text(9.8, y - 0.2, 'Ex: ' + example, fontsize=8, ha='left', va='center',
                color='white', alpha=0.8)
        y -= 0.65

    # JSON Topic
    ax.text(1, 3.8, 'Combined JSON Topic:', fontsize=12, fontweight='bold', color=COLORS['esp32'])
    ax.text(1, 3.4, 'sensors/esp32/all', fontsize=10, color=COLORS['mqtt'], fontfamily='monospace')

    json_box = FancyBboxPatch((1, 0.5), 14, 2.6,
                              boxstyle="round,pad=0.05,rounding_size=0.15",
                              facecolor='#2C3E50', edgecolor='white', linewidth=2, alpha=0.95)
    ax.add_patch(json_box)

    json_content = """{
  "timestamp": 1234567890,
  "device_id": "ESP32_Sensor_001",

  "climate": {
    "temperature": 25.30,
    "humidity": 62.50,
    "heat_index": 26.80,
    "comfort": "moderate"
  },

  "air_quality": {
    "pm1": 8,
    "pm25": 18,
    "pm10": 35,
    "aqi_status": "good"
  }
}"""

    ax.text(8, 1.8, json_content, fontsize=8, ha='center', va='center',
            color='#2ECC71', fontfamily='monospace')

    plt.tight_layout()
    plt.savefig('d:/DoAnTotNghiep/DATN_v1/airquality_edge_ingest/data_format_diagram.png',
                dpi=150, bbox_inches='tight', facecolor=COLORS['bg'])
    plt.close()
    print("Data format diagram saved!")


if __name__ == '__main__':
    print("Generating AirQuality Edge Ingest diagrams...")
    print("=" * 50)

    draw_firmware_flow()
    draw_system_architecture()
    draw_data_format_detail()

    print("=" * 50)
    print("All diagrams generated successfully!")
    print("")
    print("Output files:")
    print("  1. firmware_flow_diagram.png    - Detailed firmware processing flow")
    print("  2. system_architecture_diagram.png - Complete system architecture")
    print("  3. data_format_diagram.png      - MQTT data format specification")