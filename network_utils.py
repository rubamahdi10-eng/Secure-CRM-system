"""
Network Utilities for YourUni System
Automatically detects the machine's IP address for network access
"""

import socket
import logging

logger = logging.getLogger(__name__)


def get_local_ip():
    """
    Get the local IP address of the machine.
    This will return the IP address that can be used to access the system
    from other devices on the same network.

    Returns:
        str: The local IP address (e.g., '192.168.1.100')
             Returns '127.0.0.1' if unable to detect
    """
    try:
        # Create a socket connection to an external server (doesn't actually connect)
        # This tricks the OS into revealing which network interface would be used
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)

        # Use Google's DNS server as the target (8.8.8.8)
        # We don't actually send any data, just use it to determine the route
        s.connect(("8.8.8.8", 80))

        # Get the socket's own address
        local_ip = s.getsockname()[0]
        s.close()

        logger.info(f"Detected local IP address: {local_ip}")
        return local_ip
    except Exception as e:
        logger.warning(f"Could not detect IP address: {e}. Using localhost.")
        return "127.0.0.1"


def get_all_ip_addresses():
    """
    Get all IP addresses associated with this machine.

    Returns:
        list: List of IP addresses
    """
    try:
        hostname = socket.gethostname()
        ip_addresses = socket.gethostbyname_ex(hostname)[2]

        # Filter out localhost
        ip_addresses = [ip for ip in ip_addresses if not ip.startswith("127.")]

        return ip_addresses
    except Exception as e:
        logger.warning(f"Could not get all IP addresses: {e}")
        return []


def get_hostname():
    """
    Get the hostname of the machine.

    Returns:
        str: Hostname
    """
    try:
        return socket.gethostname()
    except Exception as e:
        logger.warning(f"Could not get hostname: {e}")
        return "unknown"


def get_client_ip(request):
    """
    Get the real client IP address from Flask request object.
    Handles proxies (like Render.com, AWS, Nginx) that forward the client IP
    in X-Forwarded-For or X-Real-IP headers.

    Args:
        request: Flask request object

    Returns:
        str: Client IP address
    """
    try:
        # Check for X-Forwarded-For header (set by most proxies)
        # Takes the first IP if multiple are listed
        if request.headers.get("X-Forwarded-For"):
            return request.headers.get("X-Forwarded-For").split(",")[0].strip()

        # Check for X-Real-IP header (used by some proxies like Nginx)
        if request.headers.get("X-Real-IP"):
            return request.headers.get("X-Real-IP")

        # Check for CF-Connecting-IP (Cloudflare)
        if request.headers.get("CF-Connecting-IP"):
            return request.headers.get("CF-Connecting-IP")

        # Fall back to remote_addr
        return request.remote_addr
    except Exception as e:
        logger.warning(f"Could not get client IP: {e}")
        return request.remote_addr if hasattr(request, "remote_addr") else "0.0.0.0"


def print_network_info(host, port):
    """
    Print network information for the application.

    Args:
        host (str): Host the application is running on
        port (int): Port the application is running on
    """
    print("\n" + "=" * 80)
    print("🌐 YourUni System - Network Information")
    print("=" * 80)

    hostname = get_hostname()
    print(f"\n📡 Hostname: {hostname}")

    # Get primary IP
    primary_ip = get_local_ip()

    # Get all IPs
    all_ips = get_all_ip_addresses()

    print(f"\n🔗 Access URLs:")
    print(f"   • Local:           http://localhost:{port}")
    print(f"   • Local (IP):      http://127.0.0.1:{port}")

    if primary_ip and primary_ip != "127.0.0.1":
        print(f"   • Network (Primary): http://{primary_ip}:{port}")

    if all_ips:
        for ip in all_ips:
            if ip != primary_ip:
                print(f"   • Network (Alt):   http://{ip}:{port}")

    print(f"\n💡 Share this URL with others on your network:")
    if primary_ip and primary_ip != "127.0.0.1":
        print(f"   http://{primary_ip}:{port}")
    else:
        print(
            f"   http://{all_ips[0]}:{port}"
            if all_ips
            else "   Unable to detect network IP"
        )

    print("\n" + "=" * 80)
    print()
