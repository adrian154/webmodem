const arr = [-1,-0.7142857142857143,-0.4285714285714286,-0.1428571428571429,0.1428571428571428,0.4285714285714286,0.7142857142857142,1];

class ModemTransmitter extends AudioWorkletProcessor {

    constructor(options) {
        
        super();
        this.modulationSettings = options.processorOptions.modulationSettings;
        this.rrcFilter = options.processorOptions.rrcFilter;

        // pulses extend across frame boundaries, so buffering is necessary
        this.lastFrameI = new Float32Array(128); this.nextFrameI = new Float32Array(128);
        this.lastFrameQ = new Float32Array(128); this.nextFrameQ = new Float32Array(128);
        this.writeIndex = 0;

    }

    process(inputList, outputList, parameters) {

        // transmit full buffers
        const output = outputList[0][0];
        for(let i = 0; i < output.length; i++) {
            const t = (currentFrame + i) / sampleRate;
            output[i] = Math.sin(2 * Math.PI * this.modulationSettings.carrierFrequency * t) * this.lastFrameI[i] +
                        Math.cos(2 * Math.PI * this.modulationSettings.carrierFrequency * t) * this.lastFrameQ[i];
        }

        // exchange buffers and zero out the future ones
        [this.lastFrameI, this.nextFrameI] = [this.nextFrameI, this.lastFrameI];
        [this.lastFrameQ, this.nextFrameQ] = [this.nextFrameQ, this.lastFrameQ];
        this.nextFrameI.fill(0);
        this.nextFrameQ.fill(0);

        // write pulses to I/Q buffers
        while(this.writeIndex < 128) {

            // generate random constellation point for testing purposes
            const I = arr[Math.floor(Math.random() * 8)], Q = arr[Math.floor(Math.random() * 8)];
            //const I = Math.sign(Math.random() - 0.5), Q = Math.sign(Math.random() - 0.5);

            // write to buffers
            for(let i = 0; i < this.rrcFilter.length; i++) {
                const idx = this.writeIndex + i;
                if(idx < 128) {
                    this.lastFrameI[idx] += this.rrcFilter[i] * I;
                    this.lastFrameQ[idx] += this.rrcFilter[i] * Q;
                } else {
                    this.nextFrameI[idx - 128] += this.rrcFilter[i] * I;
                    this.nextFrameQ[idx - 128] += this.rrcFilter[i] * Q;
                }
            }
        
            this.writeIndex += this.modulationSettings.symbolLen;
        
        }
        this.writeIndex -= 128;

        return true;

    }

}

registerProcessor("modem-transmitter", ModemTransmitter);