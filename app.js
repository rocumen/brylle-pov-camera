/**
 * Brylle's 1st Birthday POV Disposable Camera Web App
 * Racing Theme Edition 🏁
 */

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwQaHL0Wx2bQe3GHmQIHW8rF6ZooPNV78-T-OGFbxeUaVzJhLlEQpItE_kc1Y-P8ikAhQ/exec";

const STORAGE_COUNTER_KEY = "brylle_pov_shot_count_v1";

// DOM Elements — Views
const viewLanding = document.getElementById("view-landing");
const viewCarousel = document.getElementById("view-carousel");
const viewCamera = document.getElementById("view-camera");

// DOM Elements — View 1 (QR Landing)
const qrContainer = document.getElementById("qrcode");
const qrUrlPreview = document.getElementById("qr-url-preview");
const btnStartGuest = document.getElementById("btn-start-guest");
const btnCopyLink = document.getElementById("btn-copy-link");

// DOM Elements — View 2 (Carousel)
const carouselTrack = document.getElementById("carousel-track");
const slides = Array.from(document.querySelectorAll(".carousel-slide"));
const dots = Array.from(document.querySelectorAll(".dot"));
const btnPrevSlide = document.getElementById("btn-prev-slide");
const btnNextSlide = document.getElementById("btn-next-slide");
const nextSlideLabel = document.getElementById("next-slide-label");
const nextSlideIcon = document.getElementById("next-slide-icon");
const btnBackToQr = document.getElementById("btn-back-to-qr");
const btnSkipCarousel = document.getElementById("btn-skip-carousel");

// DOM Elements — View 3 (Camera)
const cameraVideo = document.getElementById("camera-video");
const captureCanvas = document.getElementById("capture-canvas");
const shutterFlash = document.getElementById("shutter-flash");
const shotCounterEl = document.getElementById("shot-counter");
const vfFacingLabel = document.getElementById("vf-facing-label");
const btnShutter = document.getElementById("btn-shutter");
const btnFlipCamera = document.getElementById("btn-flip-camera");
const btnCameraInfo = document.getElementById("btn-camera-info");
const btnThumbPreview = document.getElementById("btn-thumb-preview");
const thumbImg = document.getElementById("thumb-img");
const thumbBadge = document.getElementById("thumb-badge");
const cameraFallback = document.getElementById("camera-fallback");
const fallbackMessage = document.getElementById("fallback-message");
const btnRetryCamera = document.getElementById("btn-retry-camera");
const nativeCameraInput = document.getElementById("native-camera-input");

// DOM Elements — Gallery & Toasts
const galleryModal = document.getElementById("gallery-modal");
const galleryGrid = document.getElementById("gallery-grid");
const btnCloseGallery = document.getElementById("btn-close-gallery");
const toastRack = document.getElementById("toast-rack");

// Application State
let currentSlideIndex = 0;
let currentFacingMode = "environment"; // Default to rear camera on mobile
let activeStream = null;
let snappedCount = parseInt(localStorage.getItem(STORAGE_COUNTER_KEY) || "0", 10);
const sessionPhotos = []; // Stores { id, filename, dataUrl, status }
let toastIdSeq = 0;

/* =========================================================
   1. INITIALIZATION & URL ROUTING (?view=guest)
   ========================================================= */

function getGuestAppUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "guest");
  url.hash = "";
  return url.toString();
}

function renderDynamicQRCode() {
  const guestUrl = getGuestAppUrl();
  if (qrUrlPreview) {
    qrUrlPreview.textContent = guestUrl;
  }

  if (!qrContainer) return;
  qrContainer.innerHTML = "";

  if (typeof window.QRCode !== "undefined") {
    new window.QRCode(qrContainer, {
      text: guestUrl,
      width: 156,
      height: 156,
      colorDark: "#0D0E12",
      colorLight: "#FFFDF9",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  } else {
    // Fallback QR image API if CDN script hasn't finished loading yet
    const fallbackImg = document.createElement("img");
    fallbackImg.alt = "Guest App QR Code";
    fallbackImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=156x156&data=${encodeURIComponent(
      guestUrl
    )}`;
    qrContainer.appendChild(fallbackImg);
  }
}

function switchView(targetViewName, updateUrl = true) {
  viewLanding.hidden = targetViewName !== "landing";
  viewCarousel.hidden = targetViewName !== "carousel";
  viewCamera.hidden = targetViewName !== "camera";

  viewLanding.classList.toggle("active", targetViewName === "landing");
  viewCarousel.classList.toggle("active", targetViewName === "carousel");
  viewCamera.classList.toggle("active", targetViewName === "camera");

  if (targetViewName === "camera") {
    startCameraStream(currentFacingMode);
  } else {
    stopCameraStream();
  }

  if (updateUrl) {
    const nextUrl = new URL(window.location.href);
    if (targetViewName === "landing") {
      nextUrl.searchParams.delete("view");
    } else {
      nextUrl.searchParams.set("view", "guest");
    }
    window.history.replaceState({ view: targetViewName }, "", nextUrl.toString());
  }
}

/* =========================================================
   2. STEP-BY-STEP IMAGE CAROUSEL LOGIC
   ========================================================= */

function updateCarouselUI(index) {
  currentSlideIndex = Math.max(0, Math.min(slides.length - 1, index));

  slides.forEach((slide, i) => {
    slide.classList.toggle("is-active", i === currentSlideIndex);
  });

  dots.forEach((dot, i) => {
    const isActive = i === currentSlideIndex;
    dot.classList.toggle("active", isActive);
    dot.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (btnPrevSlide) {
    btnPrevSlide.disabled = currentSlideIndex === 0;
  }

  const isFinalSlide = currentSlideIndex === slides.length - 1;
  if (nextSlideLabel && nextSlideIcon) {
    if (isFinalSlide) {
      nextSlideLabel.textContent = "Open Camera";
      nextSlideIcon.textContent = "📸";
    } else {
      nextSlideLabel.textContent = "Next Lap";
      nextSlideIcon.textContent = "→";
    }
  }
}

function goToSlide(index) {
  const clamped = Math.max(0, Math.min(slides.length - 1, index));
  const targetSlide = slides[clamped];
  if (targetSlide && carouselTrack) {
    carouselTrack.scrollTo({
      left: targetSlide.offsetLeft,
      behavior: "smooth",
    });
  }
  updateCarouselUI(clamped);
}

// Observe horizontal swipe snapping on the carousel track
function setupCarouselObserver() {
  if (!carouselTrack) return;

  let scrollTimeout = null;
  carouselTrack.addEventListener(
    "scroll",
    () => {
      if (scrollTimeout) window.cancelAnimationFrame(scrollTimeout);
      scrollTimeout = window.requestAnimationFrame(() => {
        const trackWidth = carouselTrack.clientWidth;
        if (trackWidth > 0) {
          const newIndex = Math.round(carouselTrack.scrollLeft / trackWidth);
          if (newIndex !== currentSlideIndex) {
            updateCarouselUI(newIndex);
          }
        }
      });
    },
    { passive: true }
  );

  // Tappable pagination dots
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const idx = Number(dot.dataset.index || 0);
      goToSlide(idx);
    });
  });

  // Tappable slide card (tap right side to advance)
  slides.forEach((slide, idx) => {
    slide.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      if (idx < slides.length - 1) {
        goToSlide(idx + 1);
      }
    });
  });

  if (btnPrevSlide) {
    btnPrevSlide.addEventListener("click", () => {
      if (currentSlideIndex > 0) {
        goToSlide(currentSlideIndex - 1);
      }
    });
  }

  if (btnNextSlide) {
    btnNextSlide.addEventListener("click", () => {
      if (currentSlideIndex < slides.length - 1) {
        goToSlide(currentSlideIndex + 1);
      } else {
        // Final slide "Open Camera" tapped!
        switchView("camera");
      }
    });
  }
}

/* =========================================================
   3. WEB CAMERA & AUTO-SAVE TO GOOGLE DRIVE
   ========================================================= */

function updateShotCounterDisplay() {
  if (shotCounterEl) {
    shotCounterEl.textContent = String(snappedCount).padStart(2, "0");
  }
  if (sessionPhotos.length > 0) {
    btnThumbPreview.disabled = false;
    thumbImg.src = sessionPhotos[0].dataUrl;
    thumbBadge.hidden = false;
    thumbBadge.textContent = String(sessionPhotos.length);
  }
}

async function startCameraStream(preferredFacingMode = "environment") {
  stopCameraStream();
  cameraFallback.hidden = true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraFallback(
      "Your browser doesn't expose live camera streaming here, or requires HTTPS. You can snap a photo directly below!"
    );
    return;
  }

  const constraintsList = [
    {
      audio: false,
      video: {
        facingMode: { ideal: preferredFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    {
      audio: false,
      video: { facingMode: preferredFacingMode },
    },
    {
      audio: false,
      video: true,
    },
  ];

  let lastError = null;
  for (const constraints of constraintsList) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStream = stream;
      cameraVideo.srcObject = stream;
      await cameraVideo.play().catch(() => {});

      // Mirror video preview only when using front/user selfie camera
      const isFront = preferredFacingMode === "user";
      cameraVideo.classList.toggle("mirrored", isFront);
      if (vfFacingLabel) {
        vfFacingLabel.textContent = isFront ? "FRONT CAM" : "REAR CAM";
      }
      return;
    } catch (err) {
      lastError = err;
    }
  }

  console.warn("Camera access fallback triggered:", lastError);
  showCameraFallback(
    "Camera permission was blocked or no camera was detected. Allow camera access or tap below to snap with your phone camera!"
  );
}

function stopCameraStream() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
  if (cameraVideo) {
    cameraVideo.srcObject = null;
  }
}

function showCameraFallback(msg) {
  if (fallbackMessage && msg) {
    fallbackMessage.textContent = msg;
  }
  if (cameraFallback) {
    cameraFallback.hidden = false;
  }
}

function triggerShutterFlash() {
  if (!shutterFlash) return;
  shutterFlash.classList.remove("flash-active");
  // Force reflow so rapid consecutive taps re-trigger the flash animation cleanly
  void shutterFlash.offsetWidth;
  shutterFlash.classList.add("flash-active");

  if (navigator.vibrate) {
    navigator.vibrate(35);
  }
}

/**
 * Draw active video frame to HTML5 <canvas> and compress to Base64 JPEG (0.8)
 */
function captureFrameAsBase64Jpeg() {
  const hasLiveVideo =
    activeStream &&
    cameraVideo &&
    cameraVideo.readyState >= 2 &&
    cameraVideo.videoWidth > 0 &&
    cameraVideo.videoHeight > 0;

  if (!hasLiveVideo) {
    return null;
  }

  const width = cameraVideo.videoWidth;
  const height = cameraVideo.videoHeight;
  captureCanvas.width = width;
  captureCanvas.height = height;

  const ctx = captureCanvas.getContext("2d");
  ctx.save();

  // If front camera is mirrored in viewfinder, mirror the captured photo to match what the guest saw
  if (currentFacingMode === "user") {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(cameraVideo, 0, 0, width, height);
  ctx.restore();

  return captureCanvas.toDataURL("image/jpeg", 0.8);
}

/**
 * Compress an uploaded/native-camera File image via HTML5 <canvas> to Base64 JPEG (0.8)
 */
function compressFileToBase64Jpeg(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1920;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        captureCanvas.width = width;
        captureCanvas.height = height;
        const ctx = captureCanvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(captureCanvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Non-blocking Toast Notification using popover="manual"
 * Follows persistent-toast-notifications guide
 */
function createUploadToast(initialText) {
  const toastEl = document.createElement("div");
  const toastId = `pov-toast-${++toastIdSeq}`;
  toastEl.id = toastId;
  toastEl.className = "toast-popover";
  toastEl.setAttribute("popover", "manual");

  const msgSpan = document.createElement("span");
  msgSpan.className = "toast-msg";
  msgSpan.textContent = initialText;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close-btn";
  closeBtn.setAttribute("popovertarget", toastId);
  closeBtn.setAttribute("popovertargetaction", "hide");
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => dismissToast(toastEl));

  toastEl.append(msgSpan, closeBtn);
  toastRack.appendChild(toastEl);

  if (typeof toastEl.showPopover === "function") {
    try {
      toastEl.showPopover();
    } catch {
      toastEl.classList.add(":popover-open");
    }
  } else {
    toastEl.classList.add(":popover-open");
  }

  return {
    update(newText, stateClass = "toast-saved", autoHideMs = 2600) {
      msgSpan.textContent = newText;
      toastEl.classList.remove("toast-saved", "toast-error");
      if (stateClass) toastEl.classList.add(stateClass);
      if (autoHideMs > 0) {
        window.setTimeout(() => dismissToast(toastEl), autoHideMs);
      }
    },
  };
}

function dismissToast(toastEl) {
  if (!toastEl || !toastEl.isConnected) return;
  if (typeof toastEl.hidePopover === "function") {
    try {
      toastEl.hidePopover();
    } catch {
      // Ignore if already hidden
    }
  }
  toastEl.remove();
}

/**
 * Automatically upload Base64 JPEG to Google Apps Script Web App URL
 * Crucial CORS Detail:
 *   headers: { "Content-Type": "text/plain;charset=utf-8" }
 *   body: JSON.stringify({ filename: "POV_" + Date.now() + ".jpg", image: base64Image })
 */
async function handleSnapAndUpload(base64Image) {
  triggerShutterFlash();

  const timestamp = Date.now();
  const filename = "POV_" + timestamp + ".jpg";

  // Increment persistent & session counters immediately so guests can keep snapping non-stop
  snappedCount += 1;
  localStorage.setItem(STORAGE_COUNTER_KEY, String(snappedCount));

  const photoEntry = {
    id: timestamp,
    filename,
    dataUrl: base64Image,
    status: "Saving to Birthday Vault... 🎈",
  };
  sessionPhotos.unshift(photoEntry);
  updateShotCounterDisplay();
  renderGalleryGrid();

  // Show non-blocking toast notification
  const toast = createUploadToast("Saving to Birthday Vault... 🎈");

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        filename: filename,
        image: base64Image,
      }),
    });

    // Even if opaque or 200 OK, update state to Saved! 🎉
    if (response.ok || response.type === "opaque") {
      photoEntry.status = "Saved! 🎉";
      toast.update("Saved! 🎉", "toast-saved", 2500);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    console.error("Google Drive upload error:", err);
    photoEntry.status = "Saved locally (Retry queued) ⚠️";
    toast.update("Check connection — Saved to Roll 📸", "toast-error", 3500);
  } finally {
    renderGalleryGrid();
  }
}

function renderGalleryGrid() {
  if (!galleryGrid) return;
  galleryGrid.innerHTML = "";

  sessionPhotos.forEach((item) => {
    const card = document.createElement("div");
    card.className = "gallery-item";

    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = item.filename;

    const status = document.createElement("div");
    status.className = "gallery-item-status";
    status.textContent = item.status;

    card.append(img, status);
    galleryGrid.appendChild(card);
  });
}

/* =========================================================
   4. EVENT LISTENERS & INITIAL BOOTSTRAP
   ========================================================= */

function initApp() {
  renderDynamicQRCode();
  setupCarouselObserver();
  updateShotCounterDisplay();

  // Check URL query parameter (?view=guest)
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "guest") {
    switchView("carousel", false);
    updateCarouselUI(0);
  } else {
    switchView("landing", false);
  }

  // View 1: Start / Preview Guest App button
  if (btnStartGuest) {
    btnStartGuest.addEventListener("click", () => {
      switchView("carousel", true);
      goToSlide(0);
    });
  }

  // View 1: Copy Guest Link button
  if (btnCopyLink) {
    btnCopyLink.addEventListener("click", async () => {
      const guestUrl = getGuestAppUrl();
      try {
        await navigator.clipboard.writeText(guestUrl);
        btnCopyLink.innerHTML = "<span>✅ Guest Link Copied!</span>";
        setTimeout(() => {
          btnCopyLink.innerHTML = "<span>🔗 Copy Guest Camera Link</span>";
        }, 2200);
      } catch {
        window.prompt("Copy Guest Camera Link:", guestUrl);
      }
    });
  }

  // View 2: Back to QR Card & Skip buttons
  if (btnBackToQr) {
    btnBackToQr.addEventListener("click", () => {
      switchView("landing", true);
    });
  }

  if (btnSkipCarousel) {
    btnSkipCarousel.addEventListener("click", () => {
      switchView("camera", false);
    });
  }

  // View 3: Shutter Button
  if (btnShutter) {
    btnShutter.addEventListener("click", () => {
      const base64Image = captureFrameAsBase64Jpeg();
      if (base64Image) {
        handleSnapAndUpload(base64Image);
      } else if (nativeCameraInput) {
        // Fallback to native phone camera input if live video stream isn't active
        nativeCameraInput.click();
      }
    });
  }

  // View 3: Flip Front / Back Camera Button
  if (btnFlipCamera) {
    btnFlipCamera.addEventListener("click", () => {
      currentFacingMode =
        currentFacingMode === "environment" ? "user" : "environment";
      startCameraStream(currentFacingMode);
    });
  }

  // View 3: Guide button (return to 3-slide carousel)
  if (btnCameraInfo) {
    btnCameraInfo.addEventListener("click", () => {
      switchView("carousel", false);
    });
  }

  // View 3: Retry live camera & native camera file input fallback
  if (btnRetryCamera) {
    btnRetryCamera.addEventListener("click", () => {
      startCameraStream(currentFacingMode);
    });
  }

  if (nativeCameraInput) {
    nativeCameraInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const base64Image = await compressFileToBase64Jpeg(file);
        handleSnapAndUpload(base64Image);
      } catch (err) {
        console.error("Failed to process photo file:", err);
      } finally {
        nativeCameraInput.value = "";
      }
    });
  }

  // View 3: Thumbnail Roll Modal
  if (btnThumbPreview) {
    btnThumbPreview.addEventListener("click", () => {
      if (sessionPhotos.length > 0) {
        galleryModal.hidden = false;
      }
    });
  }

  if (btnCloseGallery) {
    btnCloseGallery.addEventListener("click", () => {
      galleryModal.hidden = true;
    });
  }

  if (galleryModal) {
    galleryModal.addEventListener("click", (e) => {
      if (e.target === galleryModal) {
        galleryModal.hidden = true;
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", initApp);
