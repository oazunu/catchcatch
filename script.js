const video = document.getElementById("camera");
const canvas = document.getElementById("effectCanvas");
const ctx = canvas.getContext("2d");


// ========================================
// 화면 크기
// ========================================

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();

window.addEventListener("resize", resizeCanvas);


// ========================================
// MediaPipe Hands
// ========================================

const hands = new Hands({
    locateFile: function (file) {
        return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});


// ========================================
// 손 상태
// ========================================

const handStates = [
    {
        grabbing: false,

        // 처음 잡은 위치
        startX: 0,
        startY: 0
    },

    {
        grabbing: false,

        startX: 0,
        startY: 0
    }
];


// ========================================
// 좌표 변환
// ========================================

function toScreenPosition(point) {

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const cw = canvas.width;
    const ch = canvas.height;

    const scale = Math.max(
        cw / vw,
        ch / vh
    );

    const width = vw * scale;
    const height = vh * scale;

    const offsetX =
        (cw - width) / 2;

    const offsetY =
        (ch - height) / 2;

    return {
        x: (1 - point.x) * width + offsetX,
        y: point.y * height + offsetY
    };
}


// ========================================
// 카메라 화면
// ========================================

function drawVideo() {

    if (
        video.readyState < 2 ||
        video.videoWidth === 0
    ) {
        return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const cw = canvas.width;
    const ch = canvas.height;

    const scale = Math.max(
        cw / vw,
        ch / vh
    );

    const width = vw * scale;
    const height = vh * scale;

    const x = (cw - width) / 2;
    const y = (ch - height) / 2;

    ctx.save();

    ctx.translate(cw, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
        video,
        -x,
        y,
        width,
        height
    );

    ctx.restore();
}


// ========================================
// 현재 화면을 잡아당기기
// ========================================

function stretch(
    centerX,
    centerY,
    totalMoveX,
    totalMoveY
) {

    const radius = 190;

    const left = Math.max(
        0,
        Math.floor(centerX - radius)
    );

    const top = Math.max(
        0,
        Math.floor(centerY - radius)
    );

    const right = Math.min(
        canvas.width,
        Math.ceil(centerX + radius)
    );

    const bottom = Math.min(
        canvas.height,
        Math.ceil(centerY + radius)
    );

    const width = right - left;
    const height = bottom - top;

    if (
        width <= 0 ||
        height <= 0
    ) {
        return;
    }


    // 현재 카메라 화면의 일부를 가져옴
    const source =
        ctx.getImageData(
            left,
            top,
            width,
            height
        );

    const output =
        ctx.createImageData(
            width,
            height
        );


    // 왜곡 강도
    const strengthAmount = 1.8;


    for (let y = 0; y < height; y++) {

        for (let x = 0; x < width; x++) {

            const worldX =
                left + x;

            const worldY =
                top + y;


            const dx =
                worldX - centerX;

            const dy =
                worldY - centerY;


            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            let sampleX = x;
            let sampleY = y;


            if (distance < radius) {

                const strength =
                    Math.pow(
                        1 - distance / radius,
                        2
                    );


                // 처음 잡은 위치에서
                // 현재 위치까지의 전체 이동량
                sampleX =
                    x -
                    totalMoveX *
                    strengthAmount *
                    strength;

                sampleY =
                    y -
                    totalMoveY *
                    strengthAmount *
                    strength;
            }


            sampleX = Math.max(
                0,
                Math.min(
                    width - 1,
                    Math.round(sampleX)
                )
            );

            sampleY = Math.max(
                0,
                Math.min(
                    height - 1,
                    Math.round(sampleY)
                )
            );


            const sourceIndex =
                (sampleY * width + sampleX) * 4;

            const targetIndex =
                (y * width + x) * 4;


            output.data[targetIndex] =
                source.data[sourceIndex];

            output.data[targetIndex + 1] =
                source.data[sourceIndex + 1];

            output.data[targetIndex + 2] =
                source.data[sourceIndex + 2];

            output.data[targetIndex + 3] =
                source.data[sourceIndex + 3];
        }
    }


    ctx.putImageData(
        output,
        left,
        top
    );
}


// ========================================
// 손 인식
// ========================================

hands.onResults(function (results) {

    // 매 프레임 새로운 카메라 화면
    drawVideo();


    // ====================================
    // 손이 없으면
    // ====================================

    if (
        !results.multiHandLandmarks ||
        results.multiHandLandmarks.length === 0
    ) {

        handStates[0].grabbing = false;
        handStates[1].grabbing = false;

        return;
    }


    // ====================================
    // 양손 처리
    // ====================================

    for (
        let handIndex = 0;
        handIndex < results.multiHandLandmarks.length;
        handIndex++
    ) {

        const hand =
            results.multiHandLandmarks[handIndex];

        const state =
            handStates[handIndex];


        const thumb = hand[4];
        const index = hand[8];


        // --------------------------------
        // 화면 좌표
        // --------------------------------

        const thumbScreen =
            toScreenPosition(thumb);

        const indexScreen =
            toScreenPosition(index);


        const currentX =
            (thumbScreen.x +
                indexScreen.x) / 2;

        const currentY =
            (thumbScreen.y +
                indexScreen.y) / 2;


        // --------------------------------
        // 엄지와 검지 사이 거리
        // --------------------------------

        const distance =
            Math.sqrt(
                Math.pow(
                    thumb.x - index.x,
                    2
                ) +
                Math.pow(
                    thumb.y - index.y,
                    2
                )
            );


        // =================================
        // 🤏 잡기
        // =================================

        if (distance < 0.045) {

            // 처음 잡은 순간
            if (!state.grabbing) {

                state.grabbing = true;

                state.startX = currentX;
                state.startY = currentY;
            }


            // 처음 잡은 위치에서
            // 현재 위치까지의 전체 이동
            const totalMoveX =
                currentX - state.startX;

            const totalMoveY =
                currentY - state.startY;


            // 움직였을 때만 왜곡
            if (
                Math.abs(totalMoveX) > 1 ||
                Math.abs(totalMoveY) > 1
            ) {

                stretch(
                    state.startX,
                    state.startY,
                    totalMoveX,
                    totalMoveY
                );
            }


            // 흰 점
            ctx.beginPath();

            ctx.arc(
                currentX,
                currentY,
                5,
                0,
                Math.PI * 2
            );

            ctx.fillStyle = "white";

            ctx.fill();


        } else {

            // 손을 놓으면 종료
            state.grabbing = false;
        }
    }
});


// ========================================
// 카메라 시작
// ========================================

const camera = new Camera(video, {

    onFrame: async function () {

        await hands.send({
            image: video
        });

    },

    width: 1280,
    height: 720
});

camera.start();