// AI Based Smart Blind Navigation System
// Uses COCO-SSD for object detection + Speech Synthesis for voice feedback

let model = null;
let isRunning = false;
let animationId = null;
let video = null;
let canvas = null;
let ctx = null;
let voiceEnabled = true;
let lastAlertTime = 0;

// Common obstacle classes to detect
const OBSTACLE_CLASSES = [
    'person', 'chair', 'table', 'bench', 'car', 'bicycle',
    'motorcycle', 'bus', 'train', 'truck', 'boat', 'traffic light',
    'fire hydrant', 'stop sign', 'parking meter', 'cat', 'dog',
    'backpack', 'umbrella', 'handbag', 'suitcase', 'frisbee', 'skis',
    'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass',
    'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
    'donut', 'cake', 'couch', 'potted plant', 'bed', 'dining table',
    'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
    'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book',
    'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    console.log('AI Blind Navigation System Initializing...');
    await loadModel();
    setupElements();
    setupEventListeners();
});

async function loadModel() {
    const statusText = document.getElementById('statusText');
    statusText.textContent = 'Loading AI Model... (This takes 10-15 seconds first time)';

    try {
        model = await cocoSsd.load();
        console.log('Model loaded successfully!');
        statusText.textContent = 'Model loaded. Click Start to begin.';
    } catch (error) {
        console.error('Failed to load model:', error);
        statusText.textContent = 'Error loading AI model. Refresh page.';
    }
}

function setupElements() {
    video = document.getElementById('webcam');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
}

function setupEventListeners() {
    document.getElementById('startBtn').addEventListener('click', startNavigation);
    document.getElementById('stopBtn').addEventListener('click', stopNavigation);
    document.getElementById('voiceToggle').addEventListener('click', toggleVoice);
}

async function startNavigation() {
    if (!model) {
        speak("AI model still loading. Please wait.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = stream;

        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });

        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        isRunning = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('statusText').textContent = 'Navigation Active - Scanning for obstacles';

        detectObjects();

        speak("Navigation started. I will alert you about obstacles ahead.");

    } catch (error) {
        console.error('Camera error:', error);
        document.getElementById('statusText').textContent = 'Camera access denied. Please allow camera permissions.';
        speak("Cannot access camera. Please check permissions.");
    }
}

function stopNavigation() {
    isRunning = false;

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('statusText').textContent = 'Navigation Stopped';

    updateAlertIndicator('SAFE', '');
    speak("Navigation stopped.");
}

function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    const btn = document.getElementById('voiceToggle');
    btn.textContent = voiceEnabled ? '🔊 Voice: ON' : '🔇 Voice: OFF';
    speak(voiceEnabled ? "Voice feedback enabled" : "Voice feedback disabled");
}

async function detectObjects() {
    if (!isRunning || !model || !video || video.paused || video.ended) {
        return;
    }

    try {
        const predictions = await model.detect(video);

        const obstacles = predictions.filter(pred =>
            OBSTACLE_CLASSES.some(cls => pred.class.toLowerCase().includes(cls.toLowerCase()))
        );

        drawDetections(obstacles);
        processDetections(obstacles);

        animationId = requestAnimationFrame(() => detectObjects());

    } catch (error) {
        console.error('Detection error:', error);
        animationId = requestAnimationFrame(() => detectObjects());
    }
}

function drawDetections(predictions) {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (video) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    predictions.forEach(pred => {
        const [x, y, width, height] = pred.bbox;
        const boxArea = width * height;
        let color = '#00ff88';
        if (boxArea > 20000) color = '#ff4757';
        else if (boxArea > 10000) color = '#ffa500';

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = color;
        ctx.font = 'bold 16px Arial';
        const labelText = `${pred.class} (${Math.round(pred.score * 100)}%)`;
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillRect(x, y - 25, textWidth + 10, 25);

        ctx.fillStyle = '#000';
        ctx.fillText(labelText, x + 5, y - 8);
    });
}

function processDetections(predictions) {
    updateDetectionList(predictions);

    if (predictions.length === 0) {
        updateAlertIndicator('SAFE', 'Clear path ahead');
        document.getElementById('statusText').textContent = '✓ Path clear - Safe to proceed';
        return;
    }

    let closestObstacle = null;
    let maxArea = 0;

    predictions.forEach(pred => {
        const [x, y, width, height] = pred.bbox;
        const area = width * height;
        if (area > maxArea) {
            maxArea = area;
            closestObstacle = pred;
        }
    });

    if (closestObstacle) {
        const [x, y, width, height] = closestObstacle.bbox;
        const area = width * height;

        let alertLevel = 'SAFE';
        let message = '';

        if (area > 20000) {
            alertLevel = 'DANGER';
            message = `DANGER! ${closestObstacle.class} very close ahead! Please stop.`;
            document.getElementById('statusText').textContent = `⚠ DANGER: ${closestObstacle.class} immediately ahead!`;
        } else if (area > 10000) {
            alertLevel = 'CAUTION';
            message = `Caution. ${closestObstacle.class} ahead. Watch your step.`;
            document.getElementById('statusText').textContent = `⚠ CAUTION: ${closestObstacle.class} ahead`;
        } else {
            alertLevel = 'CAUTION';
            message = `${closestObstacle.class} detected at a distance. Proceed carefully.`;
            document.getElementById('statusText').textContent = `⚠ ${closestObstacle.class} detected ahead`;
        }

        updateAlertIndicator(alertLevel, message);

        const now = Date.now();
        if (voiceEnabled && (now - lastAlertTime > 3000)) {
            speak(message);
            lastAlertTime = now;
            addToVoiceLog(message);
        }
    }
}

function updateDetectionList(predictions) {
    const container = document.getElementById('detectionList');

    if (predictions.length === 0) {
        container.innerHTML = '<p>✓ No obstacles detected</p>';
        return;
    }

    container.innerHTML = predictions.map(pred => {
        const [x, y, w, h] = pred.bbox;
        const area = w * h;
        let distanceText = '';
        if (area > 20000) distanceText = '⚠ VERY CLOSE';
        else if (area > 10000) distanceText = '⚠ MEDIUM';
        else distanceText = '● FAR';

        return `
            <div class="detection-item">
                <span>🚨 ${pred.class}</span>
                <span>${Math.round(pred.score * 100)}%</span>
                <span>${distanceText}</span>
            </div>
        `;
    }).join('');
}

function updateAlertIndicator(level, message) {
    const indicator = document.getElementById('alertIndicator');
    indicator.className = '';

    if (level === 'SAFE') {
        indicator.classList.add('alert-safe');
        indicator.innerHTML = '<span>🟢 SAFE - Clear Path</span>';
    } else if (level === 'CAUTION') {
        indicator.classList.add('alert-caution');
        indicator.innerHTML = '<span>🟡 CAUTION - Obstacle Ahead</span>';
    } else if (level === 'DANGER') {
        indicator.classList.add('alert-danger');
        indicator.innerHTML = '<span>🔴 DANGER - Stop Immediately!</span>';
    }
}

function addToVoiceLog(message) {
    const logContainer = document.getElementById('voiceLog');
    const timestamp = new Date().toLocaleTimeString();
    logContainer.innerHTML = `<p><small>[${timestamp}]</small> ${message}</p>` +
        (logContainer.innerHTML.split('</p>').slice(0, 4).join('</p>'));
}

function speak(message) {
    if (!voiceEnabled) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
}