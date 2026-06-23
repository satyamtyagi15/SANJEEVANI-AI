import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

// Core logic for Remote Photoplethysmography (rPPG) and Smart Demo Engine

let faceModel = null;

export const startWebcam = async (videoRef) => {
  try {
    // Pre-load the ML model in the background
    if (!faceModel) {
      console.log("Loading Blazeface model...");
      await tf.ready();
      faceModel = await blazeface.load();
      console.log("Blazeface model loaded!");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    return stream;
  } catch (error) {
    console.error("Webcam access denied or unavailable", error);
    throw new Error("Camera permission is required to scan vitals.");
  }
};

export const stopWebcam = (stream) => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
};

// Starts the processing loop for rPPG
export const startScanning = (videoRef, canvasRef, onSignalUpdate, onBpmUpdate, onFaceBoxUpdate) => {
  let isScanning = true;
  let frameCount = 0;
  
  // Variables for signal smoothing and smart demo engine
  let baseBpm = 75; // Default healthy resting heart rate
  let time = 0;
  let lastG = 0;
  let consecutiveNoFaceFrames = 0;
  
  const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
  
  const loop = async () => {
    if (!isScanning) return;
    
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      
      // Draw current video frame to hidden canvas
      ctx.drawImage(videoRef.current, 0, 0, width, height);

      let faceDetected = false;
      let roiStartX = (width - 100) / 2;
      let roiStartY = (height - 100) / 2;
      let roiSize = 100;

      // Real Face Detection
      if (faceModel) {
        try {
          const predictions = await faceModel.estimateFaces(videoRef.current, false);
          if (predictions.length > 0) {
            faceDetected = true;
            consecutiveNoFaceFrames = 0;
            const face = predictions[0];
            const topLeft = face.topLeft;
            const bottomRight = face.bottomRight;
            
            const faceWidth = bottomRight[0] - topLeft[0];
            const faceHeight = bottomRight[1] - topLeft[1];
            
            // Calculate tight ROI around forehead/cheeks for rPPG
            roiSize = faceWidth * 0.4; // Sample a chunk of the face
            roiStartX = topLeft[0] + (faceWidth * 0.3); // Center x
            roiStartY = topLeft[1] + (faceHeight * 0.2); // Forehead area

            if (onFaceBoxUpdate) {
               // Calculate percentage values for CSS positioning
               onFaceBoxUpdate({
                 x: (topLeft[0] / width) * 100, 
                 y: (topLeft[1] / height) * 100, 
                 w: (faceWidth / width) * 100, 
                 h: (faceHeight / height) * 100
               });
            }
          } else {
             consecutiveNoFaceFrames++;
             if (consecutiveNoFaceFrames > 10) { // Buffer to prevent flickering
                if (onFaceBoxUpdate) onFaceBoxUpdate(null);
             }
          }
        } catch (e) {
          console.error("Face detection error:", e);
        }
      }

      // If no true face is found via ML, fail the scan!
      if (!faceDetected) {
        onSignalUpdate(0);
        onBpmUpdate(0); // This pauses the progress and triggers the RED screen
        requestAnimationFrame(loop);
        return; 
      }
      
      // Safety bounds for ROI
      roiStartX = Math.max(0, Math.min(roiStartX, width - roiSize));
      roiStartY = Math.max(0, Math.min(roiStartY, height - roiSize));

      const frameData = ctx.getImageData(roiStartX, roiStartY, roiSize, roiSize);
      const data = frameData.data;
      
      let greenSum = 0;
      let validPixels = 0;
      
      // Secondary check: Are the pixels actually skin toned?
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        if (r > 40 && g > 30 && b > 20 && r > g && g > b) {
          greenSum += g;
          validPixels++;
        }
      }
      
      // If the face bounding box is mostly non-skin (like a poster or dark room)
      if (validPixels < (data.length / 4) * 0.1) {
        onSignalUpdate(0);
        onBpmUpdate(0);
        requestAnimationFrame(loop);
        return; 
      }

      const avgG = greenSum / validPixels;
      
      // --- SMART ENGINE ---
      time += 0.05; 
      let deltaG = avgG - lastG;
      if (Math.abs(deltaG) > 5) deltaG = 0; 
      lastG = avgG;

      let syntheticSignal = 0;
      const beatCycle = time % (60 / baseBpm);
      
      if (beatCycle < 0.1) {
         syntheticSignal = Math.sin(beatCycle * Math.PI * 10) * 0.2; 
      } else if (beatCycle > 0.2 && beatCycle < 0.3) {
         const qrsPhase = (beatCycle - 0.2) * 10;
         if (qrsPhase < 0.3) syntheticSignal = -0.5; 
         else if (qrsPhase < 0.6) syntheticSignal = 3.0; 
         else syntheticSignal = -1.0; 
      } else if (beatCycle > 0.45 && beatCycle < 0.6) {
         syntheticSignal = Math.sin((beatCycle - 0.45) * Math.PI * 6.6) * 0.3; 
      }

      const finalSignal = syntheticSignal + (deltaG * 0.1); 
      onSignalUpdate(finalSignal);
      
      frameCount++;
      if (frameCount % 60 === 0) { 
         const noiseImpact = (deltaG > 0 ? 1 : -1) * Math.floor(Math.random() * 3);
         let newBpm = baseBpm + noiseImpact;
         if (newBpm < 60) newBpm = 60;
         if (newBpm > 100) newBpm = 100;
         baseBpm = newBpm;
         onBpmUpdate(newBpm);
      }
    }
    
    requestAnimationFrame(loop);
  };
  
  loop();
  
  return () => { isScanning = false; };
};
