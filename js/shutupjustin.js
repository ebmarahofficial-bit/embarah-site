// shutupjustin.js
// Easter egg: tap/click screen 5 times to play shutupjustin.mp3 (repeatable)

/* (function () {
  let clickCount = 0;
  let timeout;
  const audio = new Audio("assets/shutupjustin.mp3");
  audio.volume = 0.25; // play at 25% volume

  function handleClick() {
    clickCount++;

    // Reset counter if user stops clicking for 5s
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      clickCount = 0;
    }, 5000);

    if (clickCount >= 5) {
      clickCount = 0; // reset so it can be triggered again
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.log("Audio playback blocked until user interacts:", err);
      });
    }
  }

  // Works for desktop clicks + mobile taps
  document.addEventListener("click", handleClick);
  document.addEventListener("touchstart", handleClick);
})();
