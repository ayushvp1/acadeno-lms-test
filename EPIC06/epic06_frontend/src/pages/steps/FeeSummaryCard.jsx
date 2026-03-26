import React from 'react';

export const FeeSummaryCard = ({ feeDetails }) => {
  if (!feeDetails) return null;

  return (
    <div style={{ marginTop: '24px', padding: '20px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <h3 style={{ fontSize: '16px', color: 'var(--navy-bg)', marginBottom: '16px', fontWeight: 600 }}>Fee Summary</h3>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: 'var(--gray-text)' }}>
        <span>Base Fee:</span>
        <span>₹{feeDetails.base_fee?.toFixed(2)}</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', color: 'var(--gray-text)' }}>
        <span>GST (18%):</span>
        <span>₹{feeDetails.gst_amount?.toFixed(2)}</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontSize: '16px', fontWeight: 700, color: 'var(--text-dark)' }}>
        <span>Total Payable:</span>
        <span>₹{feeDetails.total_fee?.toFixed(2)}</span>
      </div>
    </div>
  );
};
