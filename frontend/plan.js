// Handle trip cost calculation
document.getElementById('calculate-btn').addEventListener('click', () => { 
  const dest = document.getElementById('destination').value;
  const exp = document.getElementById('experience').value;
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  const adults = parseInt(document.getElementById('adults').value || 0);
  const children = parseInt(document.getElementById('children').value || 0);
  const accom = document.getElementById('accommodation').value;
  const transport = document.getElementById('transport').value;

  // Validate fields
  if (!dest || !exp || !start || !end || !accom || !transport) {
    alert("⚠️ Please fill in all required fields before proceeding.");
    return;
  }

  // Temporary visual feedback
  const calcBtn = document.getElementById('calculate-btn');
  calcBtn.innerText = "Calculating...";
  setTimeout(() => calcBtn.innerText = "Calculate Trip", 1000);

  // Base destination cost
  let base = 0;
  switch(dest) {
    case 'Diani': base = 20000; break;
    case 'Amboseli': base = 25000; break;
    case 'Maasai Mara': base = 30000; break;
    case 'Nairobi National Park': base = 15000; break;
    case 'Mt. Kenya': base = 27000; break;
    case 'Ol Pejeta': base = 28000; break;
  }

  // Additional costs
  let accomCost = accom === "Luxury" ? 15000 : accom === "Mid-range" ? 8000 : 4000;
  let transportCost = transport === "Private Car" ? 10000 : transport === "Tour Van" ? 8000 : 5000;

  // Total cost
  let total = base + accomCost + transportCost + (adults * 2000) + (children * 1000);
  let bookingFee = total * 0.2;
  let balance = total - bookingFee;

  // Update Summary
  document.getElementById('sum-destination').innerText = dest;
  document.getElementById('sum-experience').innerText = exp;
  document.getElementById('sum-dates').innerText = `${start} to ${end}`;
  document.getElementById('sum-travellers').innerText = `${adults} Adults, ${children} Children`;
  document.getElementById('sum-accommodation').innerText = accom;
  document.getElementById('sum-transport').innerText = transport;
  document.getElementById('sum-total').innerText = `KES ${total.toLocaleString()}`;
  document.getElementById('sum-fee').innerText = `KES ${bookingFee.toLocaleString()}`;
  document.getElementById('sum-balance').innerText = `KES ${balance.toLocaleString()}`;

  // Smooth scroll to summary
  document.querySelector('.trip-summary').scrollIntoView({ behavior: "smooth" });
});

// Handle confirmation (placeholder for backend integration)
document.getElementById('confirm-btn').addEventListener('click', () => {
  alert("✅ Booking confirmed!\n\nA payment prompt (M-Pesa STK Push) will appear shortly.");
  // 🔜 Future: Trigger backend M-Pesa STK Push API call here.
});
