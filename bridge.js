// bridge.js - Comunicación verificada con Google Apps Script
function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.script || !google.script.run) {
      reject(new Error("Las operaciones requieren el contexto autenticado de Google Apps Script."));
      return;
    }

    const runner = google.script.run
      .withSuccessHandler(response => {
        if (response && response.success) resolve(response);
        else reject(new Error(response && response.error ? response.error : "Respuesta no válida de Google Apps Script."));
      })
      .withFailureHandler(reject);

    try {
      runner[functionName].apply(runner, args);
    } catch (error) {
      reject(error);
    }
  });
}

window.callGAS = callGAS;
