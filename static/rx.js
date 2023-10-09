const PI2 = 2 * Math.PI;

class ModemReceiver extends AudioWorkletProcessor {

    constructor(options) {
        
        super();
        this.modulationSettings = options.processorOptions.modulationSettings;
        this.filter = this.createFilter(options.processorOptions.rrcFilter);
        this.lastFrameI = new Float32Array(128); this.curFrameI = new Float32Array(128);
        this.lastFrameQ = new Float32Array(128); this.curFrameQ = new Float32Array(128);
        this.readIndex = 0;
        console.log(options.processorOptions.rrcFilter.join('\n'));
        console.log(this.createLowpass().join('\n'))
        console.log(this.filter.join('\n'))

        // buffer storing decoded constellation points
        this.decodedPoints = new Float32Array(Math.floor(128 / this.modulationSettings.symbolLen * 2) + 1);

    }

    // create lowpass filter by applying a Hamming window to sinc
    createLowpass() {

        // TODO: figure out why for some lenghts the filter goes haywire
        const filter = new Array(40);
        const CUTOFF = this.modulationSettings.carrierFrequency / sampleRate;

        for(let i = 0; i < filter.length; i++) {
            const window = 0.54 - 0.46 * Math.cos(PI2 * i / filter.length);
            if(i == filter.length / 2)
                filter[i] = PI2 * CUTOFF * window;
            else
                filter[i] = Math.sin(PI2 * CUTOFF * (i - filter.length / 2)) / (i - filter.length / 2) * window;
        }

        return filter;

    }

    // apply lowpass + RRC filter to recover baseband signals
    createFilter(rrc) {

        // convolve lowpass and RRC
        const lowpass = this.createLowpass();
        const filter = new Array(lowpass.length + rrc.length).fill(0);
        for(let i = 0; i < lowpass.length; i++) {
            for(let j = 0; j < rrc.length; j++) {
                filter[i + j] += lowpass[i] * rrc[j];
            }
        }

        // scale filter so gain = 1
        const sum = filter.reduce((a, c) => a + c);
        return filter.map(x => x / sum);

    }

    process(inputList, outputList, parameters) {

        const input = inputList[0][0];
        for(let i = 0; i < input.length; i++) {
            const t = (currentFrame + i) / sampleRate;
            this.curFrameI[i] = input[i] * Math.sin(PI2 * this.modulationSettings.carrierFrequency * t);
            this.curFrameQ[i] = input[i] * Math.cos(PI2 * this.modulationSettings.carrierFrequency * t);
        }

        // downsample and filter    
        let pointIdx = 0;
        while(this.readIndex + this.filter.length < 128) {
            let ix = 0, qx = 0;
            for(let i = 0; i < this.filter.length; i++) {
                const idx = this.readIndex + i;
                if(idx < 0) {
                    ix += this.lastFrameI[idx + 128] * this.filter[i];
                    qx += this.lastFrameQ[idx + 128] * this.filter[i]; 
                } else {
                    ix += this.curFrameI[idx] * this.filter[i];
                    qx += this.curFrameQ[idx] * this.filter[i];
                }
            }
            this.decodedPoints[pointIdx++] = ix;
            this.decodedPoints[pointIdx++] = qx;
            this.readIndex += this.modulationSettings.symbolLen;
        }

        this.port.postMessage({points: this.decodedPoints, count: pointIdx / 2});

        // exchange buffers
        [this.lastFrameI, this.curFrameI] = [this.curFrameI, this.lastFrameI];
        [this.lastFrameQ, this.curFrameQ] = [this.curFrameQ, this.lastFrameQ];
        
        this.readIndex -= 128;
        return true;

    }

}

registerProcessor("modem-receiver", ModemReceiver);