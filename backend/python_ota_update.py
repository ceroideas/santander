import socket, struct, sys

def ota_update(ip, bin_path):
    data = open(bin_path, 'rb').read()
    s = socket.socket()
    s.connect((ip, 8266))
    s.settimeout(10)
    
    resp = s.recv(16).decode()
    print(f"ESP32: {resp.strip()}")   # OTA_READY
    
    # Enviar tamaño (4 bytes little-endian)
    s.send(struct.pack('<I', len(data)))
    
    # Enviar .bin en chunks
    s.settimeout(60)
    enviados = 0
    while enviados < len(data):
        chunk = data[enviados:enviados+1024]
        s.send(chunk)
        enviados += len(chunk)
        print(f"\r{enviados}/{len(data)} bytes ({enviados*100//len(data)}%)", end='')
    
    print()
    resp = s.recv(32).decode()
    print(f"ESP32: {resp.strip()}")   # OTA_OK o OTA_ERROR:...
    s.close()

ota_update("192.168.10.20", sys.argv[1])
