// modem.js: UI, shared code between receiver/transmitter

// modulation settings
const modulationSettings = {
    carrierFrequency: 12000, // carrier frequency in Hz
    symbolLen: 3,            // length of a symbol in samples 
    constellationSize: 2,    // # of points per side (i.e. 4 for 16-QAM)
    rrcRolloff: 0.3          // rolloff determines excess bandwidth of RRC filter
};

const makeRRCFilter = (symbolLen, rolloff) => {

    // the RRC formula has holes at a few points that we need to manually patch up
    const filter = new Array(32);
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

const audioCtx = new OfflineAudioContext(1,48000,48000);
const rrcFilter = makeRRCFilter(modulationSettings.symbolLen, modulationSettings.rrcRolloff);

document.getElementById("start-transmit").addEventListener("click", async event => {
    
    // create transmitter worklet and start audio context
    await audioCtx.audioWorklet.addModule("/tx.js");
    const transmitter = new AudioWorkletNode(audioCtx, "modem-transmitter", {processorOptions: {modulationSettings, rrcFilter}});
    transmitter.connect(audioCtx.destination);
    audioCtx.startRendering().then(buf => {
        a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([buf.getChannelData(0).buffer], {type: 'application/octet-stream'}))
        a.download = 'data.raw'
        a.click()
    })
    //audioCtx.resume();


    // disable button 
    event.target.disabled = 1;

});