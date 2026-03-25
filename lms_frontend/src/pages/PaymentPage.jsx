import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import '../styles/student.css'; // Reuse student styles for premium feel

const PaymentPage = () => {
    const { enrollmentId } = useParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSimulatePayment = async () => {
        setLoading(true);
        try {
            // Call the webhook handler (simulated client side)
            const response = await axiosInstance.post('/api/registration/payment-webhook', { enrollment_id: enrollmentId });
            
            setSuccess(true);
            // Redirection to login after 3 seconds so they can use credentials from email
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err) {
            console.error('Payment failed:', err);
            const msg = err.response?.data?.error || err.message;
            const details = err.response?.data?.details ? ` (${err.response.data.details})` : '';
            alert(`Payment simulation failed: ${msg}${details}. Please try again.`);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="payment-success-container">
                <div className="payment-card success">
                    <div className="success-icon">✓</div>
                    <h2>Payment Successful!</h2>
                    <p>Your enrollment is now complete. We have sent your login credentials to your email.</p>
                    <p style={{ marginTop: '10px', fontSize: '0.9em', color: '#94a3b8' }}>Redirecting you to the login page...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="payment-container">
            <div className="payment-card">
                <h1 className="payment-logo">ACADENO Pay</h1>
                <p className="payment-subtitle">Finalize your enrollment and start learning</p>
                
                <div className="payment-details">
                    <div className="detail-row">
                        <span>Enrollment ID:</span>
                        <strong>{enrollmentId}</strong>
                    </div>
                </div>

                <div className="payment-methods">
                   <div className="method selected">
                       <span>Credit / Debit Card</span>
                       <div className="card-mockup">
                           <div className="chip"></div>
                           <div className="number">•••• •••• •••• 4242</div>
                       </div>
                   </div>
                   <div className="method">UPI / Net Banking</div>
                </div>

                <p className="secure-text">🔒 Secure 256-bit encrypted payment</p>

                <button 
                  className="btn-primary" 
                  onClick={handleSimulatePayment} 
                  disabled={loading}
                  style={{ width: '100%', height: '50px', fontSize: '18px', fontWeight: 'bold' }}
                >
                    {loading ? <div className="spinner"></div> : 'Confirm & Pay Now'}
                </button>
            </div>

            <style>{`
                .payment-container, .payment-success-container {
                    min-height: 100vh;
                    background: #0f172a;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                }
                .payment-card {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 40px;
                    border-radius: 20px;
                    width: 100%;
                    max-width: 450px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }
                .payment-logo { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: #818cf8; }
                .payment-subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 30px; }
                .payment-details { border-top: 1px solid rgba(255,255,255,0.1); padding: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .payment-methods { margin-bottom: 30px; }
                .method { 
                    padding: 15px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); 
                    border-radius: 12px; cursor: pointer; margin-bottom: 10px; font-size: 14px; 
                }
                .method.selected { border-color: #6366f1; background: rgba(99, 102, 241, 0.1); }
                .card-mockup { 
                    margin-top: 15px; padding: 15px; border-radius: 8px; background: linear-gradient(135deg, #1d4ed8, #6d28d9); 
                    height: 80px; position: relative;
                }
                .chip { width: 30px; height: 20px; background: #fbbf24; border-radius: 4px; margin-bottom: 10px; }
                .secure-text { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 15px; }
                
                .payment-card.success { text-align: center; }
                .success-icon { 
                    width: 80px; height: 80px; border-radius: 50%; background: #22c55e; color: #fff; font-size: 40px; 
                    display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;
                }
            `}</style>
        </div>
    );
};

export default PaymentPage;
