import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1];

export function Reveal({ children, delay = 0, y = 18, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const group = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

export function Stagger({ children, className = "" }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={group} className={className}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
