
DOCUMENTO DE ALCANCE DEL PROYECTO
Sistema de Control de Accesos
Desarrollo de Lógica de Control en Python
Cliente: Banco Santander
Integrador: SAIMA SEGURIDAD
Fecha: 19 de Enero de 2025
Versión: 1.0

Control de Versiones
Versión
Fecha
Autor
Descripción
1.0
19/01/2025
SAIMA SEGURIDAD
Versión inicial del documento


1. Resumen Ejecutivo
El presente documento define el alcance técnico para el desarrollo de la lógica de control en Python de un sistema de control de accesos para oficinas del Banco Santander. El sistema reemplaza la solución antigua basada en consola física W&M Bank por una arquitectura moderna, flexible y conectada.
El proyecto forma parte de una iniciativa más amplia que incluye el desarrollo de una aplicación Android para tablet de control (ya en desarrollo por el mismo proveedor) y, en una fase posterior, un sistema centralizado de monitorización remota (COCE).
Objetivos principales:
Desarrollar la lógica de control de 36 entradas digitales y 36 salidas de relé distribuidas en 3 módulos ETD8A12
Implementar 7 modos operativos con cambio automático por horario y calendario
Programar 33 actuaciones complejas con enclavamientos, temporizaciones y condiciones lógicas
Proporcionar API REST para integración con tablet Android
Desarrollar interfaz web de configuración y monitorización
Garantizar funcionamiento autónomo sin dependencia de conexiones externas

2. Objetivos del Proyecto
2.1. Objetivo General
Desarrollar el software de control en Python que gestione de forma inteligente y segura el acceso a las instalaciones bancarias, cumpliendo con los requisitos operativos, de seguridad y normativa bancaria del Banco Santander.
2.2. Objetivos Específicos
Garantizar la seguridad física mediante control preciso de motorizaciones EMICOM, cerraduras eléctricas y sistemas de emergencia
Optimizar la experiencia operativa con cambios automáticos de modo según horario comercial, festivos y calendario bancario
Asegurar la disponibilidad del sistema (99% uptime) con funcionamiento autónomo ante pérdida de conectividad
Facilitar la gestión mediante interfaz web intuitiva para configuración de horarios, tiempos y usuarios
Proporcionar trazabilidad completa con histórico de 180 días de todos los eventos del sistema
Preparar la arquitectura para futura integración con sistema centralizado de monitorización (COCE)

3. Contexto y Antecedentes
3.1. Situación Actual
Actualmente, las oficinas del Banco Santander utilizan un sistema de control de puertas basado en la consola física W&M Bank. Este sistema presenta limitaciones significativas:
Interfaz física poco flexible y difícil de actualizar
Limitada conectividad con otros sistemas de seguridad
Dificultad para implementar nuevos modos operativos
Sin capacidad de monitorización remota
Mantenimiento complejo y costoso
3.2. Solución Propuesta
La nueva solución reemplaza la consola física por una arquitectura moderna de tres capas:
Capa de Usuario: Tablet Android con interfaz táctil moderna (desarrollo paralelo)
Capa de Control: PC Industrial con Windows IoT ejecutando lógica Python (este proyecto)
Capa de Hardware: 3 módulos ETD8A12 con comunicación Modbus TCP/IP
3.3. Fases del Proyecto Global
El proyecto se desarrolla en múltiples fases:
Fase Actual: Desarrollo de lógica de control Python + app Android tablet
Prueba Piloto: Marzo / abril 2026 - Validación en oficina real
Producción: Mayo / junio 2026 - Despliegue masivo
Fase 2: Desarrollo sistema centralizado COCE (marzo 2026)

4. Alcance Técnico Detallado
4.1. Componentes Hardware (Referencia)
El siguiente hardware será proporcionado por el cliente (SAIMA SEGURIDAD). Se detalla únicamente como referencia para el desarrollador:
Componente
Cantidad
Especificaciones
PC Industrial
1
Windows IoT, montaje en rack
Módulos ETD8A12
3
12 DI + 12 DO cada uno, Modbus TCP/IP
Switch Ethernet
1
Red local, IPs estáticas
Tablet Android
1
Akuvox C319S con app Android (desarrollo paralelo)


4.2. Software a Desarrollar (Alcance de Este Proyecto)
El proveedor desarrollará los siguientes componentes de software:
4.2.1. Aplicación Python de Control
Servicio Windows con auto-inicio y recuperación automática ante fallos
Comunicación Modbus TCP/IP con los 3 módulos ETD8A12
Lógica de las 33 actuaciones según especificación (ver Anexo A)
Gestión de 7 modos operativos con enclavamientos
Sistema de horarios y calendario (comercial, extendido, festivos)
Gestión de temporizaciones y retardos configurables
Modo autónomo (funcionamiento sin tablet/red corporativa)
Base de datos SQLite con histórico de 180 días
Sistema de logs y auditoría
4.2.2. API REST
Protocolo: HTTPS con autenticación Basic Auth
Endpoints para cambio de modo operativo
Endpoints para consulta de estado del sistema
Endpoints para histórico de eventos
Endpoints para configuración de horarios
Documentación completa en formato Swagger/OpenAPI
Tiempo de respuesta: <500ms
4.2.3. Interfaz Web de Configuración
Interfaz web responsive con las siguientes funcionalidades:
Configuración de horarios (comercial, extendido, etc.)
Configuración de calendario de festivos
Ajuste de tiempos (retardos, pulsos)
Visualización de histórico de eventos con filtros
Visualización de estado actual del sistema en tiempo real
Configuración de IPs de los módulos ETD8A12
Gestión de usuarios y permisos de acceso

5. Arquitectura del Sistema
5.1. Diagrama de Arquitectura
El sistema se estructura en tres capas claramente diferenciadas:
CAPA 1: INTERFAZ DE USUARIO
Tablet Android Akuvox C319S con aplicación desarrollada en paralelo. Permite la selección de modo operativo y visualización del estado del sistema.
CAPA 2: LÓGICA DE CONTROL (ESTE PROYECTO)
PC Industrial Windows IoT ejecutando servicio Python que:
Implementa las 33 actuaciones de control
Gestiona los 7 modos operativos
Aplica horarios y calendarios
Proporciona API REST para tablet
Sirve interfaz web de configuración
Almacena histórico en base de datos SQLite
CAPA 3: HARDWARE DE E/S
3 módulos ETD8A12 conectados vía Modbus TCP/IP que gestionan:
Módulo 1 (Central): 12 entradas de señalización y 12 salidas de control general
Módulo 2 (Puerta Calle): 12 entradas de sensores y 12 salidas de motorización
Módulo 3 (Puerta Oficina): 12 entradas de sensores y 12 salidas de motorización
5.2. Comunicaciones
Comunicación
Protocolo
Medio
Características
Tablet ↔ PC
API REST HTTPS
Ethernet
Basic Auth, <500ms
PC ↔ ETD8A12
Modbus TCP/IP
Ethernet
IPs estáticas, <300ms
Usuario ↔ PC
HTTP/HTTPS
Navegador web
Interfaz configuración


6. Requisitos Funcionales
6.1. Modos Operativos
El sistema debe implementar 7 modos operativos con exclusión mutua (solo un modo activo a la vez):
#
Modo
Descripción y Características
1
AUTOMÁTICO
Apertura automática por detección de radares. ICR2 y llave Winhouse desactivados. No funciona con alarma conectada (prevención aperturas en festivos).
2
ESCLUSA
Apertura secuencial controlada (una puerta a la vez). ICR1 y llave Winhouse desactivados. Evita cruce de personas.
3
EXTENDIDO
Horario extendido fuera del comercial normal. Todas las funciones operativas.
4
AUTOSERVICIO
Cajeros automáticos operativos. Cierres de seguridad en puerta oficina (si está cerrada).
5
CERRADO
Instalación cerrada. Cierres de seguridad en ambas puertas (si están cerradas). Solo emergencias activas.
6
CARGA CAJERO
Recarga de cajeros. Cierres en puerta calle (si está cerrada). Emergencias anuladas temporalmente. Bloqueo puerta oficina.
7
MANUAL
Control totalmente manual. Cierres en ambas puertas (si están cerradas). Operación exclusivamente por pulsadores.


6.2. Actuaciones del Sistema
El sistema debe implementar 33 actuaciones complejas que incluyen:
Enclavamientos: Exclusión mutua entre modos y condiciones de seguridad
Temporizaciones: Pulsos de 5 segundos para aperturas, retardos configurables
Condiciones complejas: Activación de cierres solo con puerta cerrada
Prioridades: Emergencias (incendio, pulsadores verdes) con máxima prioridad
Lógica de esclusa: Control secuencial con detección de ocupación de zaguán
NOTA: La especificación detallada de las 33 actuaciones se encuentra en el Anexo A de este documento.
6.3. Gestión de Horarios y Calendario
Cambio automático de modo según franjas horarias configurables
Calendario de festivos bancarios (nacional y autonómico)
Gestión de días especiales (pre-festivos, eventos)
Sincronización opcional con calendario externo (fase 2)
Zona horaria: CET/CEST (hora peninsular española)
6.4. Histórico y Auditoría
Registro de todos los eventos del sistema con timestamp
Retención: 180 días en base de datos local SQLite
Eventos registrados: cambios de modo, aperturas, alarmas, fallos, accesos
Auditoría de acciones de usuario en interfaz web
Exportación de histórico en formato CSV

7. Requisitos No Funcionales
7.1. Disponibilidad y Fiabilidad
Disponibilidad: 99% uptime (máximo 3.65 días de inactividad/año)
Recuperación automática: Reinicio del servicio ante fallo detectado (<30 segundos)
Watchdog: Monitorización continua de salud del sistema
Persistencia: Estado del sistema se guarda periódicamente (cada 60 segundos)
Recuperación: Al reiniciar, restaura último estado válido guardado
7.2. Performance
Tiempo de respuesta API REST: <500ms (percentil 95)
Latencia activación salidas: <300ms desde recepción de entrada
Ciclo de polling Modbus: <100ms (lectura de 36 entradas)
Carga CPU: <20% en operación normal
Uso memoria RAM: <512MB
7.3. Seguridad
Autenticación API: Basic Auth sobre HTTPS (TLS 1.2+)
Certificado SSL: Autofirmado (suficiente para red local corporativa)
Gestión usuarios web: Autenticación con hash de contraseñas (bcrypt)
Logs de auditoría: Registro de todos los accesos y cambios de configuración
Protección contra inyección: Validación y sanitización de todas las entradas
Datos sensibles: Credenciales cifradas en base de datos
7.4. Modo Degradado/Autónomo
El sistema debe operar de forma autónoma en caso de pérdida de conectividad:
Escenario
Comportamiento del Sistema
Pérdida conexión con tablet
Continúa en último modo configurado. Planificación horaria sigue activa. Sistema totalmente funcional.
Pérdida conexión red corporativa
Continúa en último modo configurado. Planificación horaria local sigue funcionando. Sistema totalmente operativo.
Pérdida conexión con ETD8A12
Alarma crítica. Reintento automático de conexión cada 5 segundos. Log de fallo.
Fallo eléctrico/reinicio
Restaura último estado guardado. Auto-inicio del servicio. Verificación de integridad del sistema.


7.5. Usabilidad
Interfaz web responsive (desktop, tablet, móvil)
Idioma: Español
Validación de formularios con mensajes claros de error
Ayuda contextual en configuración avanzada
Confirmaciones para acciones críticas

8. Integraciones
8.1. Integración con Tablet Android (Alcance Actual)
La aplicación Python debe proporcionar una API REST completa para comunicación con la tablet:
Endpoints de estado: GET /api/status, GET /api/doors, GET /api/modes
Endpoints de control: POST /api/mode (cambiar modo operativo)
Endpoints de eventos: GET /api/events (histórico filtrable)
Documentación: Swagger/OpenAPI 3.0 completa y actualizada
8.2. Integración con Centro de Control (Fase 2 - Futuro)
NO INCLUIDO en este proyecto. La arquitectura debe estar preparada para futura integración:
Envío de eventos a sistema centralizado (protocolo a definir)
Recepción de comandos remotos desde COCE
Monitorización de salud del sistema
Actualización remota de configuración

9. Entregables
9.1. Software
Código fuente Python completo con comentarios y docstrings
Servicio Windows con auto-inicio y recuperación ante fallos
API REST completa documentada en Swagger/OpenAPI
Interfaz web de configuración responsive y funcional
Scripts de instalación/despliegue automatizados
Base de datos SQLite con estructura y scripts iniciales
Archivo de configuración (JSON/YAML) con valores por defecto
9.2. Testing
Tests unitarios con cobertura mínima del 70%
Tests de integración con módulos ETD8A12
Simulador/Mock de ETD8A12 para desarrollo sin hardware
Informe de pruebas con resultados y cobertura
9.3. Documentación
Manual de instalación y despliegue (paso a paso)
Manual de configuración (uso de interfaz web)
Documentación API REST (Swagger/OpenAPI)
Documentación técnica (arquitectura, diagramas de flujo)
Guía de troubleshooting (problemas comunes y soluciones)
Documentación del código (docstrings, comentarios inline)
README del proyecto con estructura y overview
9.4. Formato de Entrega
Repositorio Git con historial completo de desarrollo
Instalador ejecutable (MSI o similar) para Windows IoT
Documentación en formato PDF
Acceso a repositorio durante 12 meses post-entrega

10. Cronograma
10.1. Fases y Plazos
#
Fase
Inicio
Fin
Entregables
1
Análisis y Diseño




Documento de diseño técnico
2
Desarrollo Core




Prototipo Alpha funcional
3
API y Web UI




Prototipo Beta completo
4
Testing y Ajustes




Release Candidate
5
Documentación




Manuales y documentación
6
Entrega Final




Versión 1.0 final


10.2. Hitos Clave
Febrero 2026: Inicio del desarrollo
Marzo 2026: Prototipo Alpha (lógica básica funcional)
Abril 2026: Prototipo Beta (todas las funcionalidades)
Mayo 2026: Entrega final versión 1.0
Mayo 2026: Pruebas en oficina piloto (responsabilidad SAIMA)

11. Criterios de Aceptación
Para considerar el proyecto completado satisfactoriamente, se deben cumplir los siguientes criterios:
11.1. Funcionalidad
Las 33 actuaciones operan correctamente según especificación
Los 7 modos operativos funcionan con exclusión mutua
Cambio automático de modo por horario sin errores
Comunicación Modbus TCP/IP estable con 3 módulos ETD8A12
API REST responde correctamente a todos los endpoints
Interfaz web permite configuración completa del sistema
11.2. Performance
Tiempo de respuesta API <500ms en percentil 95
Latencia de activación de salidas <300ms
Uso de CPU <20% en operación normal
Uso de RAM <512MB
11.3. Disponibilidad
Servicio se inicia automáticamente con Windows
Recuperación automática ante fallo en <30 segundos
Modo autónomo funciona sin tablet/red corporativa
Histórico de 180 días operativo sin degradación
11.4. Testing
Cobertura de tests unitarios ≥70%
Todos los tests pasan exitosamente
Simulador de ETD8A12 permite desarrollo sin hardware
Tests de integración validan comunicación con hardware real
11.5. Documentación
Toda la documentación requerida está completa y actualizada
Manuales permiten instalación y configuración sin asistencia
Documentación API permite integración sin consultas al desarrollador
Código está correctamente comentado y documentado

12. Supuestos y Restricciones
12.1. Supuestos
El cliente proporcionará PC industrial, módulos ETD8A12 y red funcional
La aplicación Android de tablet está siendo desarrollada en paralelo
Los módulos ETD8A12 funcionan según especificaciones del fabricante
La red local del cliente es estable y confiable
El cliente tiene licencias válidas de Windows IoT
No hay restricciones corporativas que impidan uso de Python o SQLite
12.2. Restricciones
Plataforma: Obligatorio Windows IoT (no Linux)
Lenguaje: Python (versión 3.9 o superior)
Base de datos: SQLite (no servidor de BD externo)
Hardware: Módulos ETD8A12 específicos (no alternativas)
Protocolo: Modbus TCP/IP (no Modbus RTU)
API: HTTPS con Basic Auth (sin OAuth u otros)
Idioma: Español para todas las interfaces
Alcance: No incluye desarrollo app Android tablet ni sistema COCE
12.3. Dependencias
Desarrollo app Android tablet (mismo proveedor, desarrollo paralelo)
Disponibilidad de hardware para pruebas (semana antes de entrega final)
Acceso a documentación completa de módulos ETD8A12
Validación de especificaciones por equipo técnico SAIMA

13. Exclusiones del Alcance
Los siguientes elementos están EXPLÍCITAMENTE EXCLUIDOS de este proyecto:
13.1. Hardware
Adquisición de PC industrial, módulos ETD8A12 o cualquier hardware
Instalación física de equipos en oficina
Cableado, obra civil o infraestructura de red
Tablet Android Akuvox o cualquier dispositivo de usuario
13.2. Software de Terceros
Desarrollo de aplicación Android para tablet (desarrollo paralelo)
Software de centro de control remoto COCE (fase 2)
Integración con sistemas de videovigilancia
Integración con central de alarmas PCI
Licencias de Windows, Python o cualquier software de terceros
13.3. Servicios
Instalación en oficina piloto (responsabilidad SAIMA)
Configuración de red corporativa del cliente
Formación presencial al personal (solo documentación)
Soporte 24/7 (solo horario laboral durante garantía)
Personalización post-entrega no contemplada en este alcance
13.4. Funcionalidades Futuras
Integración con sistema COCE (fase 2)
Envío de eventos a servidor externo
Aplicación móvil de monitorización
Reconocimiento facial o biométrico
Análisis de video con IA
Notificaciones push o SMS

14. Garantía y Soporte
14.1. Periodo de Garantía
Duración: 6 meses desde la fecha de entrega final
Inicio: Fecha de aceptación formal del sistema por SAIMA
14.2. Cobertura de la Garantía
Durante el periodo de garantía, el proveedor se compromete a:
Corrección de bugs sin coste adicional
Soporte técnico por email en horario laboral (L-V 9:00-18:00 CET)
Actualizaciones de seguridad críticas
Parches para errores que impidan el funcionamiento normal
Acceso al repositorio de código durante el periodo de garantía
14.3. Exclusiones de Garantía
La garantía NO cubre:
Problemas causados por hardware defectuoso o incompatible
Modificaciones del código realizadas por terceros
Fallos de red, sistema operativo o infraestructura del cliente
Nuevas funcionalidades no contempladas en el alcance original
Uso indebido o negligente del sistema
Eventos de fuerza mayor
14.4. Niveles de Servicio (SLA)
Criticidad
Respuesta
Resolución
Descripción
Crítico
4 horas
24 horas
Sistema inoperativo
Alto
8 horas
48 horas
Funcionalidad principal afectada
Medio
24 horas
5 días
Funcionalidad secundaria afectada
Bajo
48 horas
10 días
Mejora o problema cosmético


NOTA: Los plazos se cuentan en horas/días laborables (L-V 9:00-18:00 CET).
14.5. Post-Garantía
Finalizado el periodo de garantía, se pueden contratar:
Contrato de mantenimiento anual (a presupuestar por separado)
Soporte por incidencias (tarifa horaria)
Desarrollo de nuevas funcionalidades (proyectos adicionales)

ANEXOS
Anexo A: Especificación Detallada de las 33 Actuaciones
A continuación se detalla la tabla completa de actuaciones del sistema, especificando origen de señal, acciones a ejecutar y condiciones de enclavamiento.
NOTA: Esta tabla corresponde al documento '250923_ACTUACIONES.xlsx' proporcionado por SAIMA SEGURIDAD. El desarrollador debe implementar la lógica exacta especificada en cada fila.
Resumen de Actuaciones por Tipo:
Actuaciones 1-7: Modos operativos con enclavamiento mutuo
Actuación 8: Señal de incendio (prioridad máxima)
Actuaciones 9-12: Pulsadores de emergencia verde
Actuaciones 13-14: Cierres mecánicos por llave Winhouse
Actuaciones 15-22: Detección de radares en modos Automático y Esclusa
Actuaciones 23-24: Pulsadores de emergencia puerta
Actuaciones 25-28: Control por interfono
Actuaciones 29-30: Llaves de emergencia
Actuaciones 31-32: Apertura remota desde COCE
El documento completo con la especificación detallada de cada actuación se encuentra disponible en el archivo '250923_ACTUACIONES.xlsx'.

Anexo B: Tabla de Entradas y Salidas Digitales
Distribución completa de las 36 entradas y 36 salidas digitales en los 3 módulos ETD8A12.
MÓDULO 1 - CENTRAL (12 IN + 12 OUT)
Entradas:
IN1: Horario Automático
IN2: Horario Esclusa
IN3: Horario Extendido
IN4: Horario Autoservicio
IN5: Horario Cerrado
IN6: Horario Carga Cajero
IN7: Horario Manual
IN8: Apertura Remota COCE Oficina
IN9: Incendio
IN10: Alarma Conectada
IN11: Presencia Zaguán
IN12: Apertura Remota Calle
Salidas:
OUT1: Alarma Zaguán
OUT2: Locución Cajero Ocupado
OUT3: Locución Pase Por Favor
OUT4: Locución Por Su Seguridad
OUT5-12: Reservadas
MÓDULO 2 - PUERTA CALLE (12 IN + 12 OUT)
Entradas:
IN1: Radar Interior
IN2: Radar Exterior
IN3: Inductivo (Llave Echada)
IN4: Inductivo (Puerta Abierta/Cerrada)
IN5: Pulsador Emergencia Puerta
IN6: Pulsador Verde (Paralelo EMICOM)
IN7: Llamada Interior
IN8: Llamada Exterior
IN9: Bloqueo Zaguán (Libre)
IN10: Presencia Zaguán
IN11: ICR 2 (Libre)
IN12: Llave Emergencia
Salidas:
OUT1: Llave Echada (EMICOM) Selector A
OUT2: Llave Echada (Alimentación Bobinas)
OUT3: Emergencia Incendio (EMICOM) Night Bank
OUT4: Emergencia Resto (EMICOM) Night Bank
OUT5: Anulación ICR 2 (EMICOM) Lock
OUT6: Anulación Alimentación Pila Winhouse
OUT7: Orden de Apertura (EMICOM) EM/OPEN/CLOSE
OUT8-12: Reservadas
MÓDULO 3 - PUERTA OFICINA (12 IN + 12 OUT)
Misma distribución que Módulo 2 (Puerta Calle)
Documento completo: 'ENTRADAS_Y_SALIDAS.xlsx'

--- FIN DEL DOCUMENTO ---
