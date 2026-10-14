// JavaScript común para la API Node 20 y el bundle de la web.
function appointmentIsPast(item, now = new Date()) {
  return new Date(item.scheduledAt).getTime() + item.durationMinutes * 60000 <= now.getTime()
}
module.exports = { appointmentIsPast }
