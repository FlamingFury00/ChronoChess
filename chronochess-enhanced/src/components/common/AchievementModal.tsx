import React, { useState, useEffect } from 'react';
import Modal from './Modal/Modal';
import { setShowAchievement } from './achievementModalService';
import { claimAchievement } from './achievementClaimService';
import type { Achievement } from '../../save/types';

export const AchievementModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [current, setCurrent] = useState<Achievement | null>(null);

  useEffect(() => {
    setShowAchievement((achievement: Achievement) => {
      setCurrent(achievement);
    });

    return () => setShowAchievement(null);
  }, []);

  return (
    <>
      {children}
      {current && (
        <Modal
          isOpen={true}
          title={`Achievement Unlocked: ${current.name}`}
          size="large"
          onClose={() => setCurrent(null)}
        >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ flex: '0 0 96px', textAlign: 'center' }}>
              <div style={{ fontSize: 48 }}>🏆</div>
              <div style={{ marginTop: 8, fontWeight: 600 }}>{current.rarity.toUpperCase()}</div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 18, margin: '0 0 8px 0' }}>{current.description}</p>
              {current.reward && current.reward.aetherShards ? (
                <p style={{ margin: 0 }}>
                  Reward: <strong>{current.reward.aetherShards} Aether Shards</strong>
                </p>
              ) : null}
            </div>
          </div>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            {current.reward && current.reward.aetherShards ? (
              <ClaimButton
                achievement={current}
                onClaimed={() => {
                  // close modal after claiming
                  setCurrent(null);
                }}
              />
            ) : (
              <button
                onClick={() => setCurrent(null)}
                style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}
              >
                Close
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default AchievementModalProvider;

// --- Claim button + confetti ---
const ClaimButton: React.FC<{ achievement: Achievement; onClaimed?: () => void }> = ({
  achievement,
  onClaimed,
}) => {
  const [claimed, setClaimed] = useState(false);

  const doConfetti = () => {
    // lightweight confetti: create colored divs that animate upwards
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '50%';
    container.style.top = '30%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2000';
    document.body.appendChild(container);

    const colors = ['#ffd700', '#ff5c8a', '#7afcff', '#9bff7a', '#c792ff'];
    for (let i = 0; i < 24; i++) {
      const particle = document.createElement('div');
      const size = Math.floor(Math.random() * 10) + 6;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.position = 'absolute';
      particle.style.left = `${Math.random() * 200 - 100}px`;
      particle.style.top = '0px';
      particle.style.borderRadius = '50%';
      particle.style.opacity = '0.95';
      particle.style.transform = `translateY(0) rotate(${Math.random() * 360}deg)`;
      particle.style.transition = `transform 900ms cubic-bezier(.2,.8,.2,1), opacity 900ms ease-out`;
      container.appendChild(particle);

      // animate
      setTimeout(
        () => {
          const dx = Math.random() * 200 - 100;
          const dy = -(Math.random() * 200 + 120);
          particle.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720}deg)`;
          particle.style.opacity = '0';
        },
        Math.random() * 80 + 20
      );
    }

    setTimeout(() => {
      try {
        document.body.removeChild(container);
      } catch (e) {}
    }, 1200);
  };

  const handleClaim = async () => {
    if (claimed) return;
    setClaimed(true);
    try {
      await claimAchievement(achievement);
      doConfetti();
      if (onClaimed) onClaimed();
    } catch (err) {
      console.error('Claim failed', err);
      setClaimed(false);
    }
  };

  return (
    <button
      onClick={handleClaim}
      disabled={claimed}
      style={{
        padding: '8px 14px',
        borderRadius: 6,
        cursor: claimed ? 'default' : 'pointer',
        background: '#6f9cff',
        color: 'white',
        border: 'none',
        fontWeight: 600,
      }}
    >
      {claimed ? 'Claimed' : `Claim ${achievement.reward?.aetherShards ?? 0} AS`}
    </button>
  );
};
