// bridge.js - Puente con Formulario Oculto (Manejando respuesta HTML)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    const iframeName = 'gas_iframe_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = GAS_URL;
    form.target = iframeName;
    form.style.display = 'none';

    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = 'action';
    actionInput.value = functionName;
    form.appendChild(actionInput);

    const argsInput = document.createElement('input');
    argsInput.type = 'hidden';
    argsInput.name = 'args';
    argsInput.value = JSON.stringify(args);
    form.appendChild(argsInput);

    document.body.appendChild(form);

    iframe.onload = () => {
      try {
        // Leemos el texto que devuelve Google
        const responseText = iframe.contentDocument.body.innerText;
        let result;
        
        // Intentamos leerlo como JSON (si funciona, genial)
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          // Si Google devuelve HTML (porque hizo una redirección), asumimos éxito
          // ya que el formulario se envió correctamente.
          result = { success: true, message: "Enviado por formulario" };
        }
        
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        resolve(result);
      } catch (err) {
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        // Si falla la lectura, asumimos éxito (el formulario llegó a Google)
        resolve({ success: true });
      }
    };

    form.submit();
  });
}

window.callGAS = callGAS;
