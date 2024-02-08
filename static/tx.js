const N = 2;
const arr = [];
for(let i = 0; i < N; i++) {
    arr.push(2*i/(N-1)-1);
}

const FRAME_SIZE = 128;

class ModemTransmitter extends AudioWorkletProcessor {

    constructor(options) {
        
        super();
        this.modulationSettings = options.processorOptions.modulationSettings;
        this.rrcFilter = options.processorOptions.rrcFilter;

        // pulses extend across frame boundaries, so buffering is necessary
        this.lastFrameI = new Float32Array(FRAME_SIZE); this.nextFrameI = new Float32Array(FRAME_SIZE);
        this.lastFrameQ = new Float32Array(FRAME_SIZE); this.nextFrameQ = new Float32Array(FRAME_SIZE);
        this.writeIndex = 0;

    }

    process(inputList, outputList, parameters) {

        // transmit full buffers
        const output = outputList[0][0];
        if(!output) {
            return true;
        }
        
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
        while(this.writeIndex < FRAME_SIZE) {

            // generate random constellation point for testing purposes
            const I = arr[Math.floor(Math.random() * arr.length)], Q = arr[Math.floor(Math.random() * arr.length)];
            
            // write to buffers
            for(let i = 0; i < this.rrcFilter.length; i++) {
                const idx = this.writeIndex + i;
                if(idx < FRAME_SIZE) {
                    this.lastFrameI[idx] += this.rrcFilter[i] * I;
                    this.lastFrameQ[idx] += this.rrcFilter[i] * Q;
                } else {
                    this.nextFrameI[idx - FRAME_SIZE] += this.rrcFilter[i] * I;
                    this.nextFrameQ[idx - FRAME_SIZE] += this.rrcFilter[i] * Q;
                }
            }
        
            this.writeIndex += this.modulationSettings.symbolLen;
        
        }
        this.writeIndex -= FRAME_SIZE;

        return true;

    }

}

registerProcessor("modem-transmitter", ModemTransmitter);