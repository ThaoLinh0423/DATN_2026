# 🔐 Generate Mosquitto Password File (`passwd`)

You need a password file when using `allow_anonymous false` in Mosquitto.

---

## ✅ Option 1: Generate Password Online

Use this tool:  
👉 [https://dmelo.eu/mosquitto_passwd_gen/](https://dmelo.eu/mosquitto_passwd_gen/)

### Steps:
1. Enter username and password.
2. Click **Generate**.
3. Copy the output (e.g., `user:$7$...`) into a file named `password.txt`.

---

## ✅ Option 2: Generate Password Offline (Command Line)

### Requirements:
- `mosquitto_passwd` installed (comes with Mosquitto)

### Command:

```bash
mosquitto_passwd -c passwd your_username
````

* `-c`: create a new file (omit to add more users later)
* You’ll be prompted to enter a password.

---

## ⚙️ mosquitto.conf Example

```conf
allow_anonymous false
password_file /mosquitto/config/password.txt
```

## ✅ Done!

Clients must now connect using a valid username and password.
