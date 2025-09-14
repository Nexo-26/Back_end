const { supabase } = require('./supabase');

class RealtimeManager {
  constructor() {
    this.channels = new Map();
  }

  // Subscribe to alert changes
  subscribeToAlerts(callback) {
    const channel = supabase
      .channel('alerts-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts'
        },
        (payload) => {
          console.log('Alert change received:', payload);
          callback(payload);
        }
      )
      .subscribe();

    this.channels.set('alerts', channel);
    return channel;
  }

  // Subscribe to tourist location updates
  subscribeToTouristUpdates(callback) {
    const channel = supabase
      .channel('tourist-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tourist_profiles'
        },
        (payload) => {
          console.log('Tourist update received:', payload);
          callback(payload);
        }
      )
      .subscribe();

    this.channels.set('tourists', channel);
    return channel;
  }

  // Unsubscribe from channel
  unsubscribe(channelName) {
    const channel = this.channels.get(channelName);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(channelName);
    }
  }

  // Unsubscribe from all channels
  unsubscribeAll() {
    this.channels.forEach((channel, name) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
  }
}

module.exports = new RealtimeManager();

