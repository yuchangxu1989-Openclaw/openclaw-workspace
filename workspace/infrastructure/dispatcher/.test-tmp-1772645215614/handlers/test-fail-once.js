
      let callCount = 0;
      module.exports = function(event, ctx) {
        callCount++;
        if (callCount <= 1) throw new Error('transient error');
        return { recovered: true, attempt: callCount };
      };
    