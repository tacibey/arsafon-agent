// netlify/functions/get-logs.js
const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    try {
        const logStore = getStore('call-logs');
        // ... (kodun geri kalanı aynı)
    } catch (error) { /*...*/ }
};
