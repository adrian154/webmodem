// # of 128-byte frames to store in buffer
const BUFFER_SIZE_IN_FRAMES = 8;

class ModemReceiver extends AudioWorkletProcessor {

    constructor() {
        super();
        this.buffer = new Float32Array(128 * BUFFER_SIZE_IN_FRAMES);
        this.index = 0;
    }

    process(inputList, outputList, parameters) {

        for(const channel of inputList[0]) {
            
        }

        return true;

    }

}

registerProcessor("modem-transmitter", ModemTransmitter);