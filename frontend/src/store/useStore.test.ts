// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useTradingStore } from './useStore';

describe('Trading Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useTradingStore.setState({
      user: null,
      token: null,
      pair: 'BTCUSDT',
      interval: '1m',
      signals: [],
    });
    localStorage.clear();
  });

  it('should initialize with default state', () => {
    const state = useTradingStore.getState();
    expect(state.pair).toBe('BTCUSDT');
    expect(state.interval).toBe('1m');
    expect(state.user).toBeNull();
  });

  it('should set user and token on login', () => {
    const user = { email: 'test@example.com' };
    const token = 'fake-jwt-token';
    
    useTradingStore.getState().login(user, token);
    
    const state = useTradingStore.getState();
    expect(state.user).toEqual(user);
    expect(state.token).toBe(token);
    expect(localStorage.getItem('token')).toBe(token);
  });

  it('should clear user on logout', () => {
    const user = { email: 'test@example.com' };
    useTradingStore.getState().login(user, 'token');
    useTradingStore.getState().logout();
    
    const state = useTradingStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should sync preferences on login', () => {
    const user = { 
      email: 'test@example.com',
      preferences: {
        pair: 'ETHUSDT',
        interval: '1h'
      }
    };
    
    useTradingStore.getState().login(user, 'token');
    const state = useTradingStore.getState();
    
    expect(state.pair).toBe('ETHUSDT');
    expect(state.interval).toBe('1h');
  });
});
