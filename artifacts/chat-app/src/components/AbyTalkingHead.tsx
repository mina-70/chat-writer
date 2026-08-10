import { useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import abyAvatar from "@/assets/aby.png";

type AnimationControls = ReturnType<typeof useAnimation>;

interface Props {
  speaking: boolean;
  wordTick: number;
  size?: "circle" | "panel";
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function scheduleHeadIdle(ctrl: AnimationControls, cancelled: { current: boolean }) {
  if (cancelled.current) return;
  const dur = randomBetween(1.8, 3.2);
  ctrl
    .start({
      rotate: randomBetween(-1.2, 1.2),
      y: randomBetween(-2, 2),
      x: randomBetween(-1, 1),
      transition: { duration: dur, ease: "easeInOut" },
    })
    .then(() => scheduleHeadIdle(ctrl, cancelled));
}

export default function AbyTalkingHead({ speaking, wordTick, size = "circle" }: Props) {
  const headCtrl = useAnimation();
  const mouthCtrl = useAnimation();
  const cancelHead = useRef({ current: false });

  useEffect(() => {
    const c = { current: false };
    cancelHead.current = c;
    if (speaking) {
      headCtrl.start({
        rotate: [0, -0.8, 0.6, -0.4, 0.8, 0],
        y: [0, -2, 1, -1.5, 1, 0],
        transition: { duration: 3.5, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" },
      });
    } else {
      scheduleHeadIdle(headCtrl, c);
    }
    return () => {
      c.current = true;
    };
  }, [speaking, headCtrl]);

  useEffect(() => {
    if (wordTick === 0) return;
    async function runSequence() {
      await mouthCtrl.start({ scaleY: 1, transition: { duration: 0 } });
      await mouthCtrl.start({ scaleY: randomBetween(2.5, 4.5), transition: { duration: 0.06, ease: [0.0, 0.0, 0.2, 1] } });
      await mouthCtrl.start({ scaleY: randomBetween(1.2, 2.2), transition: { duration: 0.05, ease: [0.4, 0.0, 1.0, 1] } });
      await mouthCtrl.start({ scaleY: randomBetween(2.8, 4), transition: { duration: 0.07, ease: [0.0, 0.0, 0.2, 1] } });
      await mouthCtrl.start({ scaleY: 0.15, transition: { duration: 0.08, ease: [0.4, 0.0, 1.0, 1] } });
    }
    runSequence();
  }, [wordTick, mouthCtrl]);

  useEffect(() => {
    if (!speaking) {
      mouthCtrl.start({ scaleY: 0.15, transition: { duration: 0.15 } });
    }
  }, [speaking, mouthCtrl]);

  if (size === "panel") {
    return (
      <div className="relative w-full h-full overflow-hidden bg-[#1a1230]">
        {/* Speaking glow border */}
        {speaking && (
          <div className="absolute inset-0 z-20 pointer-events-none rounded-2xl ring-4 ring-yellow-400/70 transition-all duration-300" />
        )}

        {/* Head — centered, fills panel */}
        <motion.div
          animate={headCtrl}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="relative" style={{ width: "100%", height: "100%" }}>
            <img
              src={abyAvatar}
              alt="ABY"
              className="w-full h-full object-cover object-top"
              draggable={false}
              style={{ filter: "brightness(1.05) contrast(1.02)" }}
            />

            {/* Mouth overlay — at ~62% height of the image, centered */}
            <motion.div
              animate={mouthCtrl}
              initial={{ scaleY: 0.15 }}
              style={{
                position: "absolute",
                top: "62%",
                left: "50%",
                translateX: "-50%",
                width: "14%",
                height: "2.2%",
                borderRadius: 999,
                background: "rgba(80, 30, 20, 0.5)",
                transformOrigin: "center center",
                filter: "blur(2px)",
                mixBlendMode: "multiply",
                pointerEvents: "none",
              }}
            />
            <motion.div
              animate={mouthCtrl}
              initial={{ scaleY: 0.15 }}
              style={{
                position: "absolute",
                top: "60.5%",
                left: "50%",
                translateX: "-50%",
                width: "12%",
                height: "1.2%",
                borderRadius: 999,
                background: "rgba(50, 15, 5, 0.22)",
                transformOrigin: "bottom center",
                filter: "blur(3px)",
                mixBlendMode: "multiply",
                pointerEvents: "none",
              }}
            />
          </div>
        </motion.div>

        {/* Name tag */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
          <span className="text-sm font-semibold text-white drop-shadow">ABY</span>
          {speaking && (
            <span className="flex gap-0.5 items-end h-3">
              {[0, 0.15, 0.3].map((d) => (
                <span
                  key={d}
                  className="w-0.5 bg-yellow-400 rounded-full animate-bounce"
                  style={{ height: "100%", animationDelay: `${d}s` }}
                />
              ))}
            </span>
          )}
        </div>
      </div>
    );
  }

  // circle mode (original)
  return (
    <div className="relative flex items-center justify-center" style={{ width: 208, height: 208 }}>
      {speaking && (
        <>
          <span className="absolute inset-0 rounded-full bg-yellow-400/10 animate-ping" style={{ animationDuration: "1.4s" }} />
          <span className="absolute inset-[-8px] rounded-full bg-yellow-400/8 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.4s" }} />
        </>
      )}
      <motion.div
        animate={headCtrl}
        style={{ width: 208, height: 208, borderRadius: "50%", overflow: "hidden", position: "relative" }}
        className={
          "border-4 shadow-2xl transition-colors duration-500 " +
          (speaking ? "border-yellow-400 shadow-yellow-400/40" : "border-white/20")
        }
      >
        <img
          src={abyAvatar}
          alt="ABY"
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
        <motion.div
          animate={mouthCtrl}
          initial={{ scaleY: 0.15 }}
          style={{
            position: "absolute",
            top: "62%",
            left: "50%",
            translateX: "-50%",
            width: 44,
            height: 7,
            borderRadius: 999,
            background: "rgba(90, 40, 30, 0.55)",
            transformOrigin: "center center",
            filter: "blur(1.5px)",
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }}
        />
        <motion.div
          animate={mouthCtrl}
          initial={{ scaleY: 0.15 }}
          style={{
            position: "absolute",
            top: "60.5%",
            left: "50%",
            translateX: "-50%",
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "rgba(60, 20, 10, 0.25)",
            transformOrigin: "bottom center",
            filter: "blur(2px)",
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }}
        />
      </motion.div>
    </div>
  );
}
