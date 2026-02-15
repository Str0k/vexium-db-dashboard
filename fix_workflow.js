const fs = require('fs');
const fileName = 'VexiumDB_Dashboard_API.json';

try {
    const rawData = fs.readFileSync(fileName, 'utf8');
    const workflow = JSON.parse(rawData);
    let fixedCount = 0;

    workflow.nodes.forEach(node => {
        if (node.type === 'n8n-nodes-base.webhook') {
            // Activar el modo de respuesta correcto
            node.parameters.responseMode = 'responseNode';
            fixedCount++;
        }
    });

    fs.writeFileSync(fileName, JSON.stringify(workflow, null, 4));
    console.log(`✅ Arreglados ${fixedCount} webhooks en el archivo.`);

} catch (err) {
    console.error('Error procesando el JSON:', err);
}
