function handleHeartbeat(debug) {
  if (debug) {
    console.log(`💓 Heartbeat received from client`);
  }
}

module.exports = { handleHeartbeat }; 