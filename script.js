const iconLinks = document.querySelectorAll('.icon-link');

iconLinks.forEach((iconLink) => {
  iconLink.addEventListener('pointermove', (event) => {
    const rect = iconLink.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    iconLink.style.transform = `translateY(-5px) rotateX(${y * -8}deg) rotateY(${x * 8}deg) scale(1.03)`;
  });

  iconLink.addEventListener('pointerleave', () => {
    iconLink.style.transform = '';
  });
});