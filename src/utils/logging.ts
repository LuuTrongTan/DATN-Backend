import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

class LoggingConfig {
  private logLevel: string;
  private rotation: string;
  private retention: string;
  private compression: boolean;
  private logDir: string;
  private sysLogPath: string;
  private errorLogPath: string;
  private combinedLogPath: string;
  private localLogDir: string;

  constructor() {
    // HARDCODE: Tất cả config cố định, không cho phép override
    this.logLevel = 'INFO';
    this.rotation = '10MB';
    this.retention = '30d';
    this.compression = true;

    // HARDCODE TUYỆT ĐỐI: Logs chỉ tạo trong Zeus
    this.logDir = path.join(__dirname, '../../logs');

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Define log file paths
    this.sysLogPath = path.join(this.logDir, 'sys.log');
    this.errorLogPath = path.join(this.logDir, 'error.log');
    this.combinedLogPath = path.join(this.logDir, 'combined.log');

    // HARDCODE TUYỆT ĐỐI: Local logs cũng chỉ tạo trong Zeus
    this.localLogDir = path.join(__dirname, '../../logs_local');

    if (!fs.existsSync(this.localLogDir)) {
      fs.mkdirSync(this.localLogDir, { recursive: true });
    }
  }

  private getCallerInfo(): { file?: string; line?: number; function?: string } {
    const originalFunc = Error.prepareStackTrace;
    let callerfile: string | undefined;
    let callerline: number | undefined;
    let callerfunction: string | undefined;

    try {
      const err = new Error();
      let currentfile: string | undefined;

      Error.prepareStackTrace = (err, stack) => {
        return stack;
      };

      const stack: NodeJS.CallSite[] = err.stack as any;

      // Bỏ qua 2 frame đầu (getCallerInfo và winston format function)
      for (let i = 2; i < stack.length; i++) {
        const frame = stack[i];
        const file = frame.getFileName();
        const line = frame.getLineNumber();
        const func = frame.getFunctionName();

        // Bỏ qua các file node_modules và winston internal
        if (file && !file.includes('node_modules') && !file.includes('winston')) {
          callerfile = file;
          callerline = line ?? undefined;
          callerfunction = func || 'anonymous';
          break;
        }
      }

      Error.prepareStackTrace = originalFunc;
    } catch (err) {
      Error.prepareStackTrace = originalFunc;
    }

    return { file: callerfile, line: callerline, function: callerfunction };
  }

  private createConsoleFormat() {
    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSSSSS' }),
      winston.format.colorize({ all: true }),
      winston.format.printf((info: any) => {
        const { timestamp, level, message, stack, ...meta } = info;
        const callerInfo = this.getCallerInfo();
        const location = callerInfo.file && callerInfo.line 
          ? ` | ${callerInfo.file}:${callerInfo.line}${callerInfo.function ? ` (${callerInfo.function})` : ''}`
          : '';
        
        const stackStr = stack ? `\n${stack}` : '';
        const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
        return `${timestamp} | ${level} | ${message}${location}${metaStr}${stackStr}`;
      })
    );
  }

  private createFileFormat() {
    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSSSSS' }),
      winston.format.errors({ stack: true }),
      winston.format.printf((info: any) => {
        const { timestamp, level, message, stack, ...meta } = info;
        const callerInfo = this.getCallerInfo();
        const location = callerInfo.file && callerInfo.line 
          ? ` | ${callerInfo.file}:${callerInfo.line}${callerInfo.function ? ` (${callerInfo.function})` : ''}`
          : '';
        
        const stackStr = stack ? `\nStack: ${stack}` : '';
        const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
        return `${timestamp} | ${level} | ${message}${location}${metaStr}${stackStr}`;
      })
    );
  }

  private parseRotation(rotation: string): { maxSize?: string; datePattern?: string } {
    if (rotation.includes('MB') || rotation.includes('KB') || rotation.includes('GB')) {
      return { maxSize: rotation };
    } else if (rotation.includes('day') || rotation.includes('hour')) {
      return { datePattern: 'YYYY-MM-DD' };
    }
    return { maxSize: '10MB' };
  }

  private parseRetention(retention: string): string {
    // Convert retention format (e.g., "30 days" -> "30d")
    const match = retention.match(/(\d+)\s*(day|days|d|hour|hours|h)/i);
    if (match) {
      const num = match[1];
      const unit = match[2].toLowerCase();
      if (unit.startsWith('d')) return `${num}d`;
      if (unit.startsWith('h')) return `${num}h`;
    }
    return '30d';
  }

  setupLogging(): winston.Logger {
    const rotationConfig = this.parseRotation(this.rotation);
    const retentionDays = this.parseRetention(this.retention);

    // Create logger
    const logger = winston.createLogger({
      level: this.logLevel.toLowerCase(),
      format: this.createFileFormat(),
      transports: [],
      exitOnError: false,
    });

    // Console transport - with colors and nice formatting
    logger.add(new winston.transports.Console({
      level: this.logLevel.toLowerCase(),
      format: this.createConsoleFormat(),
    }));

    // Primary system log file - external storage
    const sysFileTransport = new DailyRotateFile({
      filename: path.join(this.logDir, 'sys-%DATE%.log'),
      datePattern: rotationConfig.datePattern || 'YYYY-MM-DD',
      maxSize: rotationConfig.maxSize,
      maxFiles: retentionDays,
      zippedArchive: this.compression,
      format: this.createFileFormat(),
    });

    logger.add(sysFileTransport);

    // Secondary system log file - local project directory for development
    const localSysFileTransport = new DailyRotateFile({
      filename: path.join(this.localLogDir, 'sys-%DATE%.log'),
      datePattern: rotationConfig.datePattern || 'YYYY-MM-DD',
      maxSize: rotationConfig.maxSize,
      maxFiles: retentionDays,
      zippedArchive: this.compression,
      format: this.createFileFormat(),
    });

    logger.add(localSysFileTransport);

    // Primary error log file - external storage
    const errorFileTransport = new DailyRotateFile({
      filename: path.join(this.logDir, 'error-%DATE%.log'),
      datePattern: rotationConfig.datePattern || 'YYYY-MM-DD',
      maxSize: rotationConfig.maxSize,
      maxFiles: retentionDays,
      zippedArchive: this.compression,
      level: 'error',
      format: this.createFileFormat(),
    });

    logger.add(errorFileTransport);

    // Secondary error log file - local project directory for development
    const localErrorFileTransport = new DailyRotateFile({
      filename: path.join(this.localLogDir, 'error-%DATE%.log'),
      datePattern: rotationConfig.datePattern || 'YYYY-MM-DD',
      maxSize: rotationConfig.maxSize,
      maxFiles: retentionDays,
      zippedArchive: this.compression,
      level: 'error',
      format: this.createFileFormat(),
    });

    logger.add(localErrorFileTransport);

    // Primary combined log file - external storage (tất cả các level)
    const combinedFileTransport = new DailyRotateFile({
      filename: path.join(this.logDir, 'combined-%DATE%.log'),
      datePattern: rotationConfig.datePattern || 'YYYY-MM-DD',
      maxSize: rotationConfig.maxSize,
      maxFiles: retentionDays,
      zippedArchive: this.compression,
      level: 'silly', // Lấy tất cả các level log
      format: this.createFileFormat(),
    });

    logger.add(combinedFileTransport);

    // Secondary combined log file - local project directory for development
    const localCombinedFileTransport = new DailyRotateFile({
      filename: path.join(this.localLogDir, 'combined-%DATE%.log'),
      datePattern: rotationConfig.datePattern || 'YYYY-MM-DD',
      maxSize: rotationConfig.maxSize,
      maxFiles: retentionDays,
      zippedArchive: this.compression,
      level: 'silly', // Lấy tất cả các level log
      format: this.createFileFormat(),
    });

    logger.add(localCombinedFileTransport);

    return logger;
  }

  getLogger(name?: string): winston.Logger {
    const logger = this.setupLogging();
    if (name) {
      return logger.child({ name });
    }
    return logger;
  }
}

// HARDCODE: Không sử dụng environment variables, logs luôn ở trong Zeus
export const loggingConfig = new LoggingConfig();

// Setup logging when module is imported
export const logger = loggingConfig.setupLogging();

// Export the configured logger and config
export { LoggingConfig };

// Audit log function for backward compatibility
export function auditLog(event: string, details: Record<string, any> = {}) {
  logger.info(`[AUDIT] ${event}`, details);
}

