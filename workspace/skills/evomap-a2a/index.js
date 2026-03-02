#!/usr/bin/env node
/**
 * EvoMap A2A技能 v2.0 - GEP-A2A协议封装
 * 协议规范：GEP-A2A v1.0
 * 
 * 功能特性：
 * - GEP-A2A协议完整封装
 * - 自动重连机制
 * - 消息队列管理
 * - 心跳保活
 * - 协议版本协商
 */

const WebSocket = require('ws');

/**
 * GEP-A2A协议消息类型
 */
const MessageType = {
  // 连接管理
  HANDSHAKE: 'handshake',
  HANDSHAKE_ACK: 'handshake_ack',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat_ack',
  
  // 注册与发现
  REGISTER: 'register',
  REGISTER_ACK: 'register_ack',
  DISCOVER: 'discover',
  DISCOVER_RESPONSE: 'discover_response',
  
  // 数据传输
  PUBLISH: 'publish',
  PUBLISH_ACK: 'publish_ack',
  QUERY: 'query',
  QUERY_RESPONSE: 'query_response',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  
  // 错误处理
  ERROR: 'error',
  NACK: 'nack',
  
  // 控制
  CLOSE: 'close',
  RECONNECT: 'reconnect'
};

/**
 * GEP-A2A协议封装类
 */
class EvoMapA2A {
  constructor(config = {}) {
    // 协议配置
    this.protocol = 'GEP-A2A';
    this.protocolVersion = config.protocolVersion || '1.0.0';
    this.messageType = MessageType;
    
    // 连接配置
    this.hubUrl = config.hubUrl || process.env.EVOMAP_HUB_URL || 'ws://localhost:8080/ws';
    this.nodeId = config.nodeId || this._generateNodeId();
    this.nodeType = config.nodeType || 'skill_node';
    
    // 重连配置
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectAttempts = 0;
    
    // 心跳配置
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.heartbeatTimeout = config.heartbeatTimeout || 10000;
    this.heartbeatTimer = null;
    this.lastHeartbeatResponse = null;
    
    // WebSocket实例
    this.ws = null;
    this.isConnected = false;
    this.isHandshaked = false;
    
    // 消息管理
    this.messageQueue = [];
    this.pendingMessages = new Map();
    this.messageIdCounter = 0;
    
    // 能力声明
    this.capabilities = config.capabilities || ['gene_publish', 'capsule_publish', 'query', 'subscribe'];
    this.metadata = config.metadata || {};
    
    // 事件处理器
    this.eventHandlers = new Map();
    
    // 统计信息
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesQueued: 0,
      reconnections: 0,
      startTime: null
    };
  }

  /**
   * 生成节点ID
   */
  _generateNodeId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `node_${this.nodeType}_${timestamp}_${random}`;
  }

  /**
   * 生成消息ID
   */
  _generateMessageId() {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  /**
   * 构建GEP-A2A协议消息
   */
  _buildMessage(messageType, payload = {}, options = {}) {
    return {
      // 协议头（必需字段）
      protocol: this.protocol,
      protocol_version: this.protocolVersion,
      message_type: messageType,
      message_id: options.messageId || this._generateMessageId(),
      timestamp: new Date().toISOString(),
      
      // 节点标识
      node_id: this.nodeId,
      node_type: this.nodeType,
      
      // 消息内容
      payload: payload,
      
      // 可选字段
      correlation_id: options.correlationId || null,
      priority: options.priority || 'normal',
      ttl: options.ttl || 300,
      
      // 元数据
      metadata: {
        ...this.metadata,
        ...options.metadata
      }
    };
  }

  /**
   * 连接到EvoMap Hub
   */
  async connect() {
    if (!this.hubUrl) {
      console.log('[EvoMap A2A] 未配置Hub URL，使用本地模式');
      return false;
    }

    return new Promise((resolve) => {
      try {
        console.log(`[EvoMap A2A] 连接到 ${this.hubUrl}`);
        
        this.ws = new WebSocket(this.hubUrl);
        this.stats.startTime = Date.now();

        this.ws.on('open', () => {
          console.log('[EvoMap A2A] WebSocket已连接');
          this._onOpen();
          resolve(true);
        });

        this.ws.on('message', (data) => {
          this._onMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[EvoMap A2A] 连接关闭: ${code} ${reason}`);
          this._onClose(code, reason);
        });

        this.ws.on('error', (err) => {
          console.error('[EvoMap A2A] 连接错误:', err.message);
          this._onError(err);
          resolve(false);
        });

        // 连接超时
        setTimeout(() => {
          if (!this.isConnected) {
            console.log('[EvoMap A2A] 连接超时');
            resolve(false);
          }
        }, 10000);

      } catch (e) {
        console.error('[EvoMap A2A] 连接失败:', e.message);
        resolve(false);
      }
    });
  }

  /**
   * 连接打开回调
   */
  _onOpen() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    // 发送握手消息
    this._sendHandshake();
  }

  /**
   * 发送握手消息
   */
  _sendHandshake() {
    const handshake = this._buildMessage(MessageType.HANDSHAKE, {
      supported_versions: ['1.0.0'],
      capabilities: this.capabilities,
      supported_compression: [],
      supported_encodings: ['json']
    });
    
    this._sendRaw(handshake);
  }

  /**
   * 发送注册消息
   */
  _sendRegister() {
    const register = this._buildMessage(MessageType.REGISTER, {
      node_id: this.nodeId,
      node_type: this.nodeType,
      capabilities: this.capabilities,
      status: 'active',
      endpoints: [],
      metadata: this.metadata
    });
    
    this._sendRaw(register);
  }

  /**
   * 启动心跳
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.isHandshaked) {
        this._sendHeartbeat();
      }
    }, this.heartbeatInterval);
  }

  /**
   * 发送心跳
   */
  _sendHeartbeat() {
    const heartbeat = this._buildMessage(MessageType.HEARTBEAT, {
      uptime: Date.now() - this.stats.startTime,
      stats: this.stats
    });
    
    this._sendRaw(heartbeat);
    
    // 设置心跳超时检查
    setTimeout(() => {
      const timeSinceLastResponse = Date.now() - (this.lastHeartbeatResponse || 0);
      if (timeSinceLastResponse > this.heartbeatInterval + this.heartbeatTimeout) {
        console.log('[EvoMap A2A] 心跳超时，触发重连');
        this.reconnect();
      }
    }, this.heartbeatTimeout);
  }

  /**
   * 消息处理
   */
  _onMessage(data) {
    try {
      const message = JSON.parse(data);
      this.stats.messagesReceived++;
      
      // 验证协议字段
      if (!this._validateMessage(message)) {
        console.warn('[EvoMap A2A] 收到无效消息格式');
        return;
      }
      
      // 处理不同消息类型
      switch (message.message_type) {
        case MessageType.HANDSHAKE_ACK:
          this._handleHandshakeAck(message);
          break;
          
        case MessageType.REGISTER_ACK:
          this._handleRegisterAck(message);
          break;
          
        case MessageType.HEARTBEAT_ACK:
          this._handleHeartbeatAck(message);
          break;
          
        case MessageType.PUBLISH_ACK:
          this._handlePublishAck(message);
          break;
          
        case MessageType.QUERY_RESPONSE:
          this._handleQueryResponse(message);
          break;
          
        case MessageType.ERROR:
          this._handleError(message);
          break;
          
        case MessageType.DISCOVER_RESPONSE:
          this._handleDiscoverResponse(message);
          break;
          
        default:
          console.log(`[EvoMap A2A] 收到消息: ${message.message_type}`);
          this._emit('message', message);
      }
      
    } catch (e) {
      console.error('[EvoMap A2A] 消息解析错误:', e.message);
    }
  }

  /**
   * 验证消息格式
   */
  _validateMessage(message) {
    const required = ['protocol', 'protocol_version', 'message_type', 'message_id', 'timestamp'];
    return required.every(field => field in message);
  }

  /**
   * 处理握手确认
   */
  _handleHandshakeAck(message) {
    console.log('[EvoMap A2A] 握手成功，协议版本:', message.payload?.negotiated_version);
    this.isHandshaked = true;
    
    // 发送注册
    this._sendRegister();
    
    // 启动心跳
    this._startHeartbeat();
    
    // 发送队列中的消息
    this._flushMessageQueue();
    
    this._emit('connected', message);
  }

  /**
   * 处理注册确认
   */
  _handleRegisterAck(message) {
    console.log('[EvoMap A2A] 注册成功');
    this._emit('registered', message);
  }

  /**
   * 处理心跳确认
   */
  _handleHeartbeatAck(message) {
    this.lastHeartbeatResponse = Date.now();
  }

  /**
   * 处理发布确认
   */
  _handlePublishAck(message) {
    const messageId = message.correlation_id;
    if (this.pendingMessages.has(messageId)) {
      const pending = this.pendingMessages.get(messageId);
      pending.resolve(message);
      this.pendingMessages.delete(messageId);
    }
    this._emit('publish_ack', message);
  }

  /**
   * 处理查询响应
   */
  _handleQueryResponse(message) {
    const messageId = message.correlation_id;
    if (this.pendingMessages.has(messageId)) {
      const pending = this.pendingMessages.get(messageId);
      pending.resolve(message);
      this.pendingMessages.delete(messageId);
    }
    this._emit('query_response', message);
  }

  /**
   * 处理发现响应
   */
  _handleDiscoverResponse(message) {
    this._emit('discover_response', message);
  }

  /**
   * 处理错误消息
   */
  _handleError(message) {
    console.error('[EvoMap A2A] 收到错误:', message.payload?.error_code, message.payload?.error_message);
    this._emit('error', message);
  }

  /**
   * 连接关闭处理
   */
  _onClose(code, reason) {
    this.isConnected = false;
    this.isHandshaked = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // 拒绝所有待处理消息
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(new Error('Connection closed'));
    }
    this.pendingMessages.clear();
    
    this._emit('disconnected', { code, reason });
    
    // 尝试重连
    if (code !== 1000) {  // 非正常关闭
      this._attemptReconnect();
    }
  }

  /**
   * 连接错误处理
   */
  _onError(err) {
    this.isConnected = false;
    this._emit('error', err);
  }

  /**
   * 尝试重连
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[EvoMap A2A] 重连次数耗尽，放弃重连');
      this._emit('max_reconnect_exceeded');
      return;
    }

    this.reconnectAttempts++;
    this.stats.reconnections++;
    
    console.log(`[EvoMap A2A] ${this.reconnectInterval}ms后重连 (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * 主动重连
   */
  reconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Manual reconnect');
    }
    this.reconnectAttempts = 0;
    return this.connect();
  }

  /**
   * 发送消息（带等待确认）
   */
  async send(messageType, payload, options = {}) {
    const message = this._buildMessage(messageType, payload, options);
    
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.isHandshaked) {
        // 存储待处理消息
        this.pendingMessages.set(message.message_id, { resolve, reject });
        
        // 设置超时
        setTimeout(() => {
          if (this.pendingMessages.has(message.message_id)) {
            this.pendingMessages.delete(message.message_id);
            reject(new Error('Message timeout'));
          }
        }, options.timeout || 30000);
        
        this._sendRaw(message);
      } else {
        // 离线模式：入队
        this.messageQueue.push({ message, resolve, reject });
        this.stats.messagesQueued++;
        console.log('[EvoMap A2A] 离线模式，消息已入队');
        
        // 本地模式直接resolve
        if (!this.hubUrl) {
          resolve({ local: true, message });
        }
      }
    });
  }

  /**
   * 发送原始消息
   */
  _sendRaw(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
    }
  }

  /**
   * 刷新消息队列
   */
  _flushMessageQueue() {
    console.log(`[EvoMap A2A] 发送队列中 ${this.messageQueue.length} 条消息`);
    
    while (this.messageQueue.length > 0) {
      const { message, resolve, reject } = this.messageQueue.shift();
      
      this.pendingMessages.set(message.message_id, { resolve, reject });
      
      setTimeout(() => {
        if (this.pendingMessages.has(message.message_id)) {
          this.pendingMessages.delete(message.message_id);
          reject(new Error('Message timeout'));
        }
      }, 30000);
      
      this._sendRaw(message);
    }
  }

  /**
   * 发布Gene
   */
  async publishGene(gene, options = {}) {
    return this.send(MessageType.PUBLISH, {
      asset_type: 'Gene',
      asset: gene,
      ttl: options.ttl || 86400
    }, {
      priority: options.priority || 'normal',
      metadata: options.metadata
    });
  }

  /**
   * 发布Capsule
   */
  async publishCapsule(capsule, options = {}) {
    return this.send(MessageType.PUBLISH, {
      asset_type: 'Capsule',
      asset: capsule,
      ttl: options.ttl || 86400
    }, {
      priority: options.priority || 'normal',
      metadata: options.metadata
    });
  }

  /**
   * 查询
   */
  async query(querySpec, options = {}) {
    return this.send(MessageType.QUERY, {
      query_type: querySpec.type || 'generic',
      query_params: querySpec.params || {},
      filters: querySpec.filters || {}
    }, {
      timeout: options.timeout || 30000,
      metadata: options.metadata
    });
  }

  /**
   * 发现节点
   */
  async discover(capabilityFilter = {}) {
    return this.send(MessageType.DISCOVER, {
      filter: capabilityFilter,
      max_results: 100
    });
  }

  /**
   * 订阅主题
   */
  async subscribe(topic, options = {}) {
    return this.send(MessageType.SUBSCRIBE, {
      topic: topic,
      subscription_type: options.type || 'push',
      filter: options.filter || {}
    });
  }

  /**
   * 取消订阅
   */
  async unsubscribe(topic) {
    return this.send(MessageType.UNSUBSCRIBE, {
      topic: topic
    });
  }

  /**
   * 注册事件处理器
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * 触发事件
   */
  _emit(event, data) {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)) {
        try {
          handler(data);
        } catch (e) {
          console.error(`[EvoMap A2A] 事件处理器错误: ${e.message}`);
        }
      }
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    if (this.ws) {
      // 发送关闭消息
      const closeMessage = this._buildMessage(MessageType.CLOSE, {
        reason: 'Client disconnect',
        timestamp: new Date().toISOString()
      });
      this._sendRaw(closeMessage);
      
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.isConnected = false;
    this.isHandshaked = false;
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      protocol: this.protocol,
      protocol_version: this.protocolVersion,
      node_id: this.nodeId,
      connected: this.isConnected,
      handshaked: this.isHandshaked,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      stats: { ...this.stats },
      pending_messages: this.pendingMessages.size,
      queued_messages: this.messageQueue.length
    };
  }
}

// 导出模块
module.exports = EvoMapA2A;
module.exports.MessageType = MessageType;

// 如果直接运行此文件
if (require.main === module) {
  console.log('EvoMap A2A 模块 v2.0 - GEP-A2A协议封装');
  console.log('协议:', 'GEP-A2A');
  console.log('版本:', '1.0.0');
  console.log('');
  console.log('使用示例:');
  console.log('  const EvoMapA2A = require("./index.js");');
  console.log('  const client = new EvoMapA2A({');
  console.log('    hubUrl: "ws://localhost:8080/ws",');
  console.log('    nodeId: "my_node_001"');
  console.log('  });');
  console.log('  await client.connect();');
}
