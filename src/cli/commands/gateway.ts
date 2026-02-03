import { Command } from 'commander';

export function createGatewayCommand(): Command {
  const cmd = new Command('gateway')
    .description('Start the xopcbot gateway server')
    .option('--host <address>', 'Host to bind to', '0.0.0.0')
    .option('--port <number>', 'Port to listen on', '18790')
    .action(async (options) => {
      const { Gateway } = await import('./gateway.js');
      const gateway = new Gateway();
      
      const shutdown = async () => {
        await gateway.stop();
        process.exit(0);
      };
      
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      
      try {
        await gateway.start({
          host: options.host,
          port: parseInt(options.port),
        });
      } catch (error) {
        console.error('Failed to start gateway:', error);
        process.exit(1);
      }
    });

  return cmd;
}
