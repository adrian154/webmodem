const PI2 = 2 * Math.PI;

class ModemReceiver extends AudioWorkletProcessor {

    constructor(options) {
        
        super();
        this.modulationSettings = options.processorOptions.modulationSettings;
        this.rrcFilter = options.processorOptions.rrcFilter;
        this.filter = this.createFilter(0.01);
        this.lastFrameI = new Float32Array(128); this.curFrameI = new Float32Array(128);
        this.lastFrameQ = new Float32Array(128); this.curFrameQ = new Float32Array(128);
        this.readIndex = 0;
        this.oldDelay = 0.01;

        // buffer storing decoded constellation points
        this.decodedPoints = new Float32Array(Math.floor(128 / this.modulationSettings.symbolLen * 2) + 1);

    }

    static get parameterDescriptors() {
        return [
            {name: "delay", defaultValue: 0}
        ];
    }

    // create lowpass filter by applying a Hamming window to sinc
    createLowpass(delay) {

        // TODO: figure out why for some lenghts the filter goes haywire
        const filter = new Array(40);
        const CUTOFF = this.modulationSettings.carrierFrequency / sampleRate;

        for(let i = 0; i < filter.length; i++) {
            const window = 0.54 - 0.46 * Math.cos(PI2 * (i - delay) / filter.length);
            if(i - filter.length / 2 - delay == 0)
                filter[i] = PI2 * CUTOFF * window;
            else
                filter[i] = Math.sin(PI2 * CUTOFF * (i - filter.length / 2 - delay)) / (i - filter.length / 2 - delay) * window;
        }

        return filter;

    }

    // apply lowpass + RRC filter to recover baseband signals
    createFilter(delay) {

        // convolve lowpass and RRC
        const lowpass = this.createLowpass(delay);
        const filter = new Array(lowpass.length + this.rrcFilter.length).fill(0);
        if(filter.length > 128) {
            throw new Error("filter too long");
        }

        for(let i = 0; i < lowpass.length; i++) {
            for(let j = 0; j < this.rrcFilter.length; j++) {
                filter[i + j] += lowpass[i] * this.rrcFilter[j];
            }
        }

        // scale filter so gain = 1
        const sum = filter.reduce((a, c) => a + c);
        return filter.map(x => x / sum);

    }

    process(inputList, outputList, parameters) {


        if(parameters.delay[0] != this.oldDelay) {
            this.filter = this.createFilter(parameters.delay[0]);
            this.oldDelay = parameters.delay[0];
        }

        const input = inputList[0][0];
        if(!input) {
            return;
        }
        
        for(let i = 0; i < input.length; i++) {
            const t = (currentFrame + i) / sampleRate;
            this.curFrameI[i] = input[i] * Math.sin(PI2 * this.modulationSettings.carrierFrequency * t) * 4;
            this.curFrameQ[i] = input[i] * Math.cos(PI2 * this.modulationSettings.carrierFrequency * t) * 4;
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