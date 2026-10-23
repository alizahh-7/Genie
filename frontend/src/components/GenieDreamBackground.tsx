import React from 'react';
import './genie-dream-background.css';

/** Decorative background only. Place as the first child of a position:relative hero. */
export default function GenieDreamBackground() {
  return (
    <div className="genie-dream" aria-hidden="true">
      <div className="genie-dream__sky" />
      <div className="genie-dream__moon"><span /></div>
      <div className="genie-dream__cloud genie-dream__cloud--one" />
      <div className="genie-dream__cloud genie-dream__cloud--two" />
      <div className="genie-dream__cloud genie-dream__cloud--three" />
      {Array.from({length: 24}, (_, i) => (
        <i key={i} className={`genie-dream__star genie-dream__star--${i + 1}`} />
      ))}
      <div className="genie-dream__shooting genie-dream__shooting--one" />
      <div className="genie-dream__shooting genie-dream__shooting--two" />
      <div className="genie-dream__hill genie-dream__hill--back" />
      <div className="genie-dream__hill genie-dream__hill--front" />
      <div className="genie-dream__vignette" />
    </div>
  );
}
