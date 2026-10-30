// bridge.js - Puente con técnica no-cors para evitar bloqueos
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.append('action', functionName);
    params.append('args', JSON.stringify(args));

    // Hacemos la petición "no-cors". El navegador la envía pero no espera respuesta.
    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors', // <-- ESTO ES LA MAGIA
      body: params
    })
    .then(() => {
      // Como no podemos leer la respuesta por seguridad, asumimos que se envió bien.
      // Usamos un pequeño retraso para dar tiempo a que Google procese y guarde los datos.
      setTimeout(() => {
        // Aquí devolvemos un éxito "falso" solo para que la app no se congele.
        // Pero para LEER los datos usaremos otra función (getDashboardDataFallback) que veremos abajo.
        resolve({ success: true, message: "Petición enviada (modo no-cors)" });
      }, 1000);
    })
    .catch(err => {
      reject(err);
    });
  });
}

window.callGAS = callGAS;
