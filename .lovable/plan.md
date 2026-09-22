# Evitar el reinicio al fotografiar etiquetas

## Cambios
- Sustituir la foto de alta resolución del teléfono por una cámara integrada en la pantalla.
- Solicitar una imagen limitada a 1280 px y capturar directamente ese cuadro, evitando cargar la foto original completa en memoria.
- Permitir abrir, capturar y cancelar la cámara; conservar un selector de imagen como alternativa si el dispositivo bloquea la cámara integrada.
- Mantener la lectura automática de guía, nombre, dirección, teléfono y recaudo.

## Verificación
- Comprobar apertura, cancelación y captura con una cámara simulada.
- Confirmar que la imagen enviada tiene tamaño reducido y que no aparecen errores en pantalla.

## Detalles técnicos
La captura usará `getUserMedia` con cámara trasera y resolución limitada. Así se evita decodificar una fotografía de muchos megapíxeles, que es la causa probable del cierre y recarga del navegador móvil.
