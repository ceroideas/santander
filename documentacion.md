
Propósito de la reunión
Kick off the project, align on architecture, and define immediate next steps.

Puntos clave
Pila tecnológica finalizada: El proyecto usará Python en Ubuntu para maximizar el rendimiento y eliminar las costosas licencias de Windows, una medida de ahorro crítico para un despliegue de más de 100 puertas.
Bloqueadores de hardware: El proyecto está bloqueado por dos dependencias de hardware: 1) asegurar controladores de Linux para el controlador Modbus, y 2) confirmar que la cámara OEM puede modificarse para mayor robustez y calidad.
Fecha límite del piloto: El sistema central debe estar listo para un piloto en junio, lo que requiere que toda la arquitectura y la documentación se finalicen en marzo.
Herramientas de colaboración: Se creará un grupo de WhatsApp dedicado para comunicación urgente y solo de trabajo, y Asana será la herramienta central de gestión de proyectos para tareas de software y hardware.
Temas
Alcance del proyecto y cronograma
Objetivo: Reemplazar el sistema actual basado en Scati con una solución totalmente integrada y desarrollada internamente.
Fecha límite del piloto: El sistema central debe estar listo para un piloto en junio.
Despliegue completo: El proyecto está planificado para completarse en agosto.
Estrategia de hardware y cámaras
Cámara OEM: El equipo ha contactado con el fabricante OEM del videoportero.
Plan: Solicitar modificaciones (robustez, calidad, software) para un pedido al por mayor (>1,000 unidades).
Justificación: Es un elemento de la ruta crítica y debe definirse pronto para evitar retrasos.
Kit de desarrollo local: Javier enviará un kit de hardware local a Cero Ideas para un desarrollo más rápido y autónomo.
Contenido del kit: Placa controladora de puertas, PC industrial, LEDs para simular estados de puerta.
Falta: Solo hay una cámara OEM disponible actualmente.
Actualización de sensores: Sustituir los sensores volumétricos poco fiables por una sola cámara térmica de 360°.
Justificación: Los sensores actuales fallan cuando los usuarios permanecen quietos (p. ej., escribiendo en un cajero), provocando falsas alarmas y reinicios del sistema. La nueva cámara usará IA para detectar presencia y actividad con mayor precisión.
Tecnología y arquitectura
Pila tecnológica: Python en Ubuntu.
Justificación: Maximizar el rendimiento y eliminar las costosas licencias de Windows, un ahorro clave para un despliegue grande.
API: API RESTful con autenticación básica (Basic Auth).
Justificación: Garantiza compatibilidad para futuras integraciones de terceros.
Controlador Modbus: El proyecto utiliza una placa controladora Modbus ETD8.
Bloqueador: Se requieren controladores de Linux para soportar la pila elegida en Ubuntu.
Conexión: Se usará Ethernet en lugar de RS485 para una comunicación más rápida e instalación más simple.
Colaboración y gestión del proyecto
Grupo de WhatsApp: Se creará un nuevo grupo para comunicación urgente y exclusivamente de trabajo.
Asana: Será la herramienta central de gestión de proyectos para tareas de software y hardware.
GitHub: Cero Ideas configurará un repositorio y gestionará las ramas para garantizar la integridad del código.
Entregables de marzo (Fase 0)
Finalización de la arquitectura: Definir las arquitecturas del sistema local y de COCE.
Diseño de la API: Finalizar la especificación de la API REST.
Modelo de datos: Definir el modelo de datos inicial.
Configuración del backend: Configurar el backend en Python/FastAPI.
Comunicación con hardware: Preparar la capa de comunicación Modbus (pendiente de los controladores de Linux).
Documentación: Crear un documento final de arquitectura que resuma todas las decisiones.
Próximos pasos
Javier:
Enviar el kit de hardware local a Cero Ideas.
Asegurar los controladores de Linux para el controlador Modbus ETD8.
Iniciar las conversaciones para las modificaciones de la cámara OEM.
Reconfigurar el sistema antiguo para el acceso del equipo.
Cero Ideas:
Crear el grupo de WhatsApp del proyecto.
Configurar el repositorio de GitHub.
Finalizar los entregables de marzo (arquitectura, API, modelo de datos).
Documentar todas las decisiones en un documento final de arquitectura.
Todos:
Programar reuniones semanales de sincronización.


Objetivo: establecer la base técnica definitiva del sistema y preparar el entorno de desarrollo

Resultado esperado: 
Arquitectura técnica cerrada y base del sistema preparada para el desarrollo.


Subtasks
Revisión completa del alcance funcional definido en los documentos técnicos. 
•⁠  ⁠Definición final de arquitectura del sistema local y del COCE. 
•⁠  ⁠Diseño definitivo de la API REST del sistema local. 
•⁠  ⁠Definición de modelo de datos inicial. 
•⁠  ⁠Configuración del proyecto backend (Python / FastAPI). 
•⁠  ⁠Configuración del servicio del sistema local (servicio Windows). 
•⁠  ⁠Preparación de la comunicación con hardware mediante Modbus TCP/IP. 
•⁠  ⁠Configuración de repositorios, entornos y estructura de proyecto. 
•⁠  ⁠Inicio del desarrollo del núcleo del sistema