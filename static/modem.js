// modem.js: UI, shared code between receiver/transmitter

// modulation settings
const modulationSettings = {
    carrierFrequency: 12000, // carrier frequency in Hz
    symbolLen: 3,            // length of a symbol in samples 
    constellationSize: 2,    // # of points per side (i.e. 4 for 16-QAM)
    rrcRolloff: 0.1         // rolloff determines excess bandwidth of RRC filter
};

document.getElementById("modulation-settings").textContent = `carrier = ${modulationSettings.carrierFrequency} Hz, symbol length = ${modulationSettings.symbolLen}, RRC rolloff = ${modulationSettings.rrcRolloff}`;

const makeRRCFilter = (symbolLen, rolloff) => {

    // the RRC formula has holes at a few points that we need to manually patch up
    const filter = new Array(64);
    for(let i = 0; i < filter.length; i++) {
        const t = (i - filter.length / 2) / symbolLen;
        const undef = symbolLen / (4 * rolloff);
        if(i == filter.length / 2)
            filter[i] = (1 - rolloff) + 4 * rolloff / Math.PI;
        else if(i == filter.length / 2 + undef || i == filter.length / 2 - undef)
            filter[i] = rolloff / Math.sqrt(2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / 4 / rolloff) + (1 - 2 / Math.PI) * Math.cos(Math.PI / 4 / rolloff));
        else
            filter[i] = (Math.sin(Math.PI * t * (1 - rolloff)) + 4 * rolloff * t * Math.cos(Math.PI * t * (1 + rolloff))) / (Math.PI * t * (1 - (4 * rolloff * t)**2)); 
    }

    // scale kernel so gain = 1
    const sum = filter.reduce((a,c) => a + c);
    return filter.map(x => x / sum);

};

const audioCtx = new AudioContext();
const rrcFilter = makeRRCFilter(modulationSettings.symbolLen, modulationSettings.rrcRolloff);

const loopbackCheckbox = document.getElementById("loopback");
let output = null;

document.getElementById("start-transmit").addEventListener("click", async event => {
    
    // disable button 
    event.target.disabled = 1;
    outputSelect.disabled = 1;

    // create transmitter worklet and start audio context
    await audioCtx.audioWorklet.addModule("tx.js");
    const transmitter = new AudioWorkletNode(audioCtx, "modem-transmitter", {processorOptions: {modulationSettings, rrcFilter}});
    if(loopbackCheckbox.checked) {
        output = transmitter;
    } else {
        if(audioCtx.setSinkId) {
            audioCtx.setSinkId(outputSelect.value);
        }
        transmitter.connect(audioCtx.destination);
    }
    audioCtx.resume();

});

const analyzeSpectrum = input => {

    const canvas = document.getElementById("spectrum"),
          ctx = canvas.getContext("2d");

    // setup spectrum
    const analyzerNode = audioCtx.createAnalyser();
    analyzerNode.fftSize = 512;
    const buf = new Uint8Array(analyzerNode.frequencyBinCount);
    input.connect(analyzerNode);
    analyzerNode.smoothingTimeConstant = 0.8;

    const draw = () => {

        analyzerNode.getByteFrequencyData(buf);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        for(let i = 0; i < buf.length; i++) {
            if(i == 0)
                ctx.moveTo(i / buf.length * canvas.width, (1 - buf[i] / 255) * canvas.height);
            else
                ctx.lineTo(i / buf.length * canvas.width, (1 - buf[i] / 255) * canvas.height);
        }
        ctx.stroke();
        requestAnimationFrame(draw);
    };

    draw();

};

const drawConstellation = receiver => {

    let count = 0;
    const canvas = document.getElementById("constellation"),
          ctx = canvas.getContext("2d");

    let points = [];

    receiver.port.onmessage = (message) => {
        if(count % 20 == 0) {

            // compute mean distance 
            let avgDist = 0;
            for(const point of points) {
                avgDist += Math.sqrt(point[0]**2 + point[1]**2);
            }
            avgDist /= points.length;

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#000000";
            for(const point of points) {
                ctx.beginPath();
                ctx.arc(canvas.width/2 + point[0]/avgDist*100, canvas.height/2 + point[1]/avgDist*100, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            points = [];

        } else {
            for(let i = 0; i < message.data.count; i += 2) {
                points.push([message.data.points[i], message.data.points[i + 1]]);
            }
        }
        count++;
    };

};

document.getElementById("start-receive").addEventListener("click", async event => {

    if(loopbackCheckbox.checked && !output) {
        alert("You need to start the transmitter first!");
        return;
    }

    // disable button 
    event.target.disabled = 1;
    inputSelect.disabled = 1;

    await audioCtx.audioWorklet.addModule("rx.js");
    const receiver = new AudioWorkletNode(audioCtx, "modem-receiver", {processorOptions: {modulationSettings, rrcFilter}});
    const input = loopbackCheckbox.checked ? output : await audioCtx.createMediaStreamSource(await navigator.mediaDevices.getUserMedia({audio: {deviceId: inputSelect.value}}));
    input.connect(receiver);
    audioCtx.resume();

    // draw analytics
    analyzeSpectrum(input);
    drawConstellation(receiver);

    document.getElementById("delay").addEventListener("input", event => {
        const delay = event.target.value / event.target.max * modulationSettings.symbolLen;
        receiver.parameters.get("delay").value = delay;
        document.getElementById("delay-value").textContent = delay.toFixed(2);
    });

});

// populate input device options
const inputSelect = document.getElementById("input-select"),
      outputSelect = document.getElementById("output-select");

navigator.mediaDevices.getUserMedia({audio: true}).then(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => devices.forEach(device => {
        if(device.kind == "audioinput" || device.kind == "audiooutput") {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.label;
            option.selected = 1;
            if(device.kind == "audioinput")
                inputSelect.append(option);
            else if(audioCtx.setSinkId)
                outputSelect.append(option);
        }
    }))
});

if(!audioCtx.setSinkId) {
    outputSelect.disabled = 1;
    const option = document.createElement("option");
    option.textContent = "your browser does not support output selection :(";
    option.selected = 1;
    outputSelect.append(option);
}